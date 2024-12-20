// Filepath: backend/src/services/downloadManager.ts

import { Pool, PoolClient } from 'pg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { Transform, pipeline } from 'stream';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { TwitchAPIService } from './twitch/api';
import {
  VodStatus,
  VideoQuality,
  DownloadPriority,
  TaskProgressInfo,
  TaskStorageInfo,
  TaskVODStats,
  TaskDetails,
  TaskStatus
} from '../types/database';

import type {
  SystemResources,
  ResourceWarning,
  ResourceCritical,
  ResourceThresholds,
  SegmentInfo,
  SegmentedPlaylist,
  DownloadManagerConfig,
  DownloadState,
  DownloadProgress,
  QueueStatus,
  IDownloadManager
} from '../types/downloadManager';

const pipelineAsync = promisify(pipeline);

class DownloadManager extends EventEmitter implements IDownloadManager {
  private static instance: DownloadManager | null = null;
  private pool: Pool;
  private tempDir: string;
  private maxConcurrent: number;
  private activeDownloads: Map<number, DownloadState>;
  private retryAttempts: number;
  private retryDelay: number;
  private twitchAPI: TwitchAPIService;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private processingInterval: NodeJS.Timeout | null = null;
  private resourceCheckInterval: NodeJS.Timeout | null = null;
  private shutdownTimeout: number = 30000;
  private isShuttingDown: boolean = false;
  private resourceThresholds: ResourceThresholds = {
    maxMemoryUsage: 0.9, // 90%
    minDiskSpace: 10 * 1024 * 1024 * 1024, // 10GB
    maxCpuUsage: 0.8 // 80%
  };
  private metrics: {
    totalBytesDownloaded: number;
    totalDownloads: number;
    failedDownloads: number;
    averageSpeed: number;
    peakMemoryUsage: number;
    startTime: number;
  };
  private constructor(
    pool: Pool,
    config: DownloadManagerConfig
  ) {
    super();
    this.pool = pool;
    this.tempDir = config.tempDir;
    this.maxConcurrent = config.maxConcurrent;
    this.retryAttempts = config.retryAttempts;
    this.retryDelay = config.retryDelay;
    this.activeDownloads = new Map();
    this.shutdownTimeout = config.shutdownTimeout || 30000;

    this.metrics = {
      totalBytesDownloaded: 0,
      totalDownloads: 0,
      failedDownloads: 0,
      averageSpeed: 0,
      peakMemoryUsage: 0,
      startTime: Date.now()
    };

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    this.twitchAPI = TwitchAPIService.getInstance();
    this.setupIntervals(config.cleanupInterval);
  }

  public static getInstance(
    pool: Pool,
    config: DownloadManagerConfig
  ): DownloadManager {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager(pool, config);
    }
    return DownloadManager.instance;
  }

  public async addToQueue(vodId: number, priority: DownloadPriority = 'normal'): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const vodExists = await client.query(
        'SELECT id FROM vods WHERE id = $1',
        [vodId]
      );

      if (vodExists.rows.length === 0) {
        throw new Error(`VOD with ID ${vodId} not found`);
      }

      await client.query(
        `UPDATE vods 
         SET download_status = 'queued',
             download_priority = $1,
             scheduled_for = NOW(),
             retry_count = COALESCE(retry_count, 0),
             updated_at = NOW()
         WHERE id = $2 AND download_status = 'pending'`,
        [priority, vodId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding to download queue:', error);
      throw error;
    } finally {
      client.release();
    }
  }

    public async getTaskDetails(taskId: number): Promise<TaskDetails> {
    const client = await this.pool.connect();
    try {
      // Get task details from the database
      const result = await client.query(`
        SELECT t.*, 
               COUNT(v.id) as total_vods,
               SUM(v.file_size) as total_storage_used
        FROM tasks t
        LEFT JOIN vods v ON v.task_id = t.id
        WHERE t.id = $1
        GROUP BY t.id
      `, [taskId]);

      if (result.rows.length === 0) {
        throw new Error(`Task not found with ID ${taskId}`);
      }

      const task = result.rows[0];
      const totalStorage = task.total_storage_used || 0;
      const storageLimit = task.storage_limit_gb ? task.storage_limit_gb * 1024 * 1024 * 1024 : null;

      const details: TaskDetails = {
        id: result.rows[0].id,
        task_id: taskId,
        progress: {
          percentage: 0,
          completed: 0,
          total: 0
        },
        storage: {
          used: totalStorage,
          limit: storageLimit || 0,
          remaining: storageLimit ? storageLimit - totalStorage : 0
        },
        vod_stats: {
          total_vods: parseInt(task.total_vods) || 0,
          total_size: totalStorage,
          average_duration: 0,
          download_success_rate: 0,
          vods_by_quality: {},
          vods_by_language: {}
        },
        created_at: task.created_at,
        updated_at: task.updated_at
      };

      return details;
    } finally {
      client.release();
    }
  }

  public async executeTask(taskId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Verify task exists and is active
      const task = await client.query(`
        SELECT * FROM tasks WHERE id = $1 AND is_active = true
      `, [taskId]);

      if (task.rows.length === 0) {
        throw new Error(`Task ${taskId} not found or is inactive`);
      }

      // Update task status to running
      await client.query(`
        UPDATE tasks 
        SET status = 'running',
            last_run = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [taskId]);

      // Process channels
      if (task.rows[0].channel_ids?.length > 0) {
        for (const channelId of task.rows[0].channel_ids) {
          try {
            const vods = await this.twitchAPI.getChannelVODs(channelId.toString());
            for (const vod of vods) {
              await this.addToQueue(parseInt(vod.id), task.rows[0].priority);
            }
          } catch (error) {
            logger.error(`Error processing channel ${channelId} for task ${taskId}:`, error);
          }
        }
      }

      // Process games
      if (task.rows[0].game_ids?.length > 0) {
        for (const gameId of task.rows[0].game_ids) {
          try {
            const vods = await this.twitchAPI.getGameVODs(gameId.toString());
            for (const vod of vods) {
              await this.addToQueue(parseInt(vod.id), task.rows[0].priority);
            }
          } catch (error) {
            logger.error(`Error processing game ${gameId} for task ${taskId}:`, error);
          }
        }
      }

      // Update task status to completed
      await client.query(`
        UPDATE tasks 
        SET status = 'completed',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [taskId]);

      logger.info(`Task ${taskId} execution completed successfully`);
    } catch (error) {
      // Update task status to failed
      await client.query(`
        UPDATE tasks 
        SET status = 'failed',
            error_message = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [taskId, error instanceof Error ? error.message : 'Unknown error']);

      throw error;
    } finally {
      client.release();
    }
  }

  private setupIntervals(cleanupInterval: number): void {
    // Cleanup interval
    this.cleanupInterval = setInterval(
      () => this.performPeriodicCleanup(),
      cleanupInterval * 1000
    );

    // Resource monitoring interval
    this.resourceCheckInterval = setInterval(
      () => this.checkSystemResources(),
      60000 // Check every minute
    );
  }

  private createDownloadState(vodId: number, totalSegments: number): DownloadState {
    return {
      vodId,
      progress: {
        vodId,
        segmentIndex: 0,
        totalSegments,
        bytesDownloaded: 0,
        totalBytes: 0,
        speed: 0,
        eta: 0,
        status: 'downloading'
      },
      activeSegments: new Set(),
      completedSegments: new Set(),
      failedSegments: new Set(),
      checksums: new Map(),
      resumePosition: 0,
      throttle: {
        enabled: false,
        bytesPerSecond: 0,
        lastCheck: Date.now(),
        bytesSinceLastCheck: 0
      },
      resources: {
        startMemory: process.memoryUsage().heapUsed,
        peakMemory: process.memoryUsage().heapUsed,
        startTime: Date.now(),
        diskUsage: 0
      }
    };
  }

  private createThrottledStream(bytesPerSecond: number): Transform {
    const transform = new Transform({
      transform(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null, data?: any) => void) {
        this.push(chunk);
        callback();
      }
    });

    let bytesSent = 0;
    let lastCheck = Date.now();

    transform.on('data', (chunk: Buffer) => {
      bytesSent += chunk.length;
      const now = Date.now();
      const timeDiff = now - lastCheck;
      const targetBytes = (bytesPerSecond * timeDiff) / 1000;

      if (bytesSent > targetBytes) {
        const waitTime = ((bytesSent - targetBytes) * 1000) / bytesPerSecond;
        transform.pause();
        setTimeout(() => {
          transform.resume();
          bytesSent = 0;
          lastCheck = Date.now();
        }, waitTime);
      }
    });

    return transform;
  }

  private async calculateMD5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async checkSystemResources(): Promise<SystemResources> {
    const memInfo = {
      total: os.totalmem(),
      free: os.freemem(),
      processUsage: process.memoryUsage().heapUsed
    };

    const diskInfo = await new Promise<{ total: number; free: number; available: number }>((resolve, reject) => {
      fs.statfs(this.tempDir, (err, stats) => {
        if (err) reject(err);
        else resolve({
          total: stats.blocks * stats.bsize,
          free: stats.bfree * stats.bsize,
          available: stats.bavail * stats.bsize
        });
      });
    });

    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();

    const resources: SystemResources = {
      memoryUsage: {
        total: memInfo.total,
        free: memInfo.free,
        processUsage: memInfo.processUsage
      },
      diskSpace: diskInfo,
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / (os.cpus().length * 1000000),
        loadAverage: loadAvg
      }
    };

    this.checkResourceThresholds(resources);
    return resources;
  }

  private checkResourceThresholds(resources: SystemResources): void {
    // Memory check
    const memoryUsage = 1 - (resources.memoryUsage.free / resources.memoryUsage.total);
    if (memoryUsage > this.resourceThresholds.maxMemoryUsage) {
      const warning: ResourceWarning = {
        type: 'memory',
        current: memoryUsage,
        threshold: this.resourceThresholds.maxMemoryUsage,
        message: `High memory usage: ${(memoryUsage * 100).toFixed(2)}%`
      };
      this.emit('resource:warning', warning);

      if (memoryUsage > this.resourceThresholds.maxMemoryUsage + 0.1) {
        const critical: ResourceCritical = {
          ...warning,
          action: 'pause',
          message: `Critical memory usage: ${(memoryUsage * 100).toFixed(2)}%`
        };
        this.emit('resource:critical', critical);
      }
    }

    // Disk space check
    if (resources.diskSpace.available < this.resourceThresholds.minDiskSpace) {
      const warning: ResourceWarning = {
        type: 'disk',
        current: resources.diskSpace.available,
        threshold: this.resourceThresholds.minDiskSpace,
        message: `Low disk space: ${(resources.diskSpace.available / 1024 / 1024 / 1024).toFixed(2)}GB available`
      };
      this.emit('resource:warning', warning);

      if (resources.diskSpace.available < this.resourceThresholds.minDiskSpace / 2) {
        const critical: ResourceCritical = {
          ...warning,
          action: 'shutdown',
          message: `Critical disk space: ${(resources.diskSpace.available / 1024 / 1024 / 1024).toFixed(2)}GB available`
        };
        this.emit('resource:critical', critical);
      }
    }

    // CPU check
    if (resources.cpu.usage > this.resourceThresholds.maxCpuUsage) {
      const warning: ResourceWarning = {
        type: 'cpu',
        current: resources.cpu.usage,
        threshold: this.resourceThresholds.maxCpuUsage,
        message: `High CPU usage: ${(resources.cpu.usage * 100).toFixed(2)}%`
      };
      this.emit('resource:warning', warning);
    }
  }

  private async handleDownloadError(
    vodId: number,
    error: Error,
    client: PoolClient
  ): Promise<void> {
    try {
      await client.query('BEGIN');

      const vodResult = await client.query(`
        SELECT retry_count, max_retries, error_message
        FROM vods 
        WHERE id = $1
      `, [vodId]);

      if (vodResult.rows.length === 0) {
        throw new Error(`VOD ${vodId} not found`);
      }

      const vod = vodResult.rows[0];
      const retryCount = (vod.retry_count || 0) + 1;
      const shouldRetry = retryCount < vod.max_retries;

      await client.query(`
        UPDATE vods
        SET download_status = CASE 
          WHEN $2 < max_retries THEN 'pending'
          ELSE 'failed'
        END,
        retry_count = $2,
        error_message = $3,
        last_retry = NOW(),
        updated_at = NOW()
        WHERE id = $1
      `, [vodId, retryCount, error.message]);

      // Log error event
      await client.query(`
        INSERT INTO vod_events (
          vod_id,
          event_type,
          details,
          created_at
        ) VALUES ($1, 'error', $2, NOW())
      `, [vodId, JSON.stringify({
        error: error.message,
        retry_count: retryCount,
        will_retry: shouldRetry,
        stack: error.stack
      })]);

      await client.query('COMMIT');

      // Schedule retry if applicable
      if (shouldRetry) {
        setTimeout(() => {
          this.retryFailedDownload(vodId).catch(err => {
            logger.error(`Auto-retry failed for VOD ${vodId}:`, err);
          });
        }, this.retryDelay);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Error handling download failure:', err);
      throw err;
    }
  }

  private async updateDownloadProgress(
    vodId: number,
    progress: number,
    speed: number,
    client: PoolClient
  ): Promise<void> {
    try {
      await client.query(`
        UPDATE vods
        SET download_progress = $2,
            download_speed = $3,
            updated_at = NOW()
        WHERE id = $1
      `, [vodId, progress, speed]);

      // Log progress event every 10%
      if (Math.floor(progress * 10) > Math.floor((progress - 0.1) * 10)) {
        await client.query(`
          INSERT INTO vod_events (
            vod_id,
            event_type,
            details,
            created_at
          ) VALUES ($1, 'progress', $2, NOW())
        `, [vodId, JSON.stringify({
          progress: progress * 100,
          speed: speed,
          timestamp: new Date().toISOString()
        })]);
      }
    } catch (error) {
      logger.error(`Error updating download progress for VOD ${vodId}:`, error);
    }
  }

  private async downloadSegment(
    vodId: number,
    segment: SegmentInfo,
    outputPath: string,
    throttleSpeed?: number
  ): Promise<void> {
    const state = this.activeDownloads.get(vodId);
    if (!state) throw new Error(`No download state found for VOD ${vodId}`);

    state.activeSegments.add(segment.index);

    try {
      const response = await axios({
        method: 'GET',
        url: segment.url,
        responseType: 'stream',
        headers: { 'Range': `bytes=${state.resumePosition}-` }
      });

      const writer = fs.createWriteStream(outputPath, { flags: 'a' });
      const startTime = Date.now();
      let downloadedBytes = 0;

      const progressStream = new Transform({
        transform(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) {
          downloadedBytes += chunk.length;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = downloadedBytes / elapsed;

          if (state) {
            state.progress.bytesDownloaded += chunk.length;
            state.progress.speed = speed;
            state.progress.eta = (state.progress.totalBytes - state.progress.bytesDownloaded) / speed;
          }

          callback(null, chunk);
        }
      });

      let currentStream: NodeJS.ReadableStream = response.data;
      currentStream = currentStream.pipe(progressStream);

      if (throttleSpeed) {
        currentStream = currentStream.pipe(this.createThrottledStream(throttleSpeed));
      }

      await new Promise<void>((resolve, reject) => {
        currentStream
          .pipe(writer)
          .on('finish', resolve)
          .on('error', reject);
      });

      const checksum = await this.calculateMD5(outputPath);
      if (segment.checksum && checksum !== segment.checksum) {
        throw new Error(`Checksum mismatch for segment ${segment.index}`);
      }

      state.checksums.set(segment.index, checksum);
      state.completedSegments.add(segment.index);
      state.activeSegments.delete(segment.index);

    } catch (error) {
      state.failedSegments.add(segment.index);
      state.activeSegments.delete(segment.index);
      throw error;
    }
  }

  private async downloadSegmentsInParallel(
    vodId: number,
    segments: SegmentInfo[],
    tempDir: string,
    maxConcurrent: number,
    throttleSpeed?: number
  ): Promise<void> {
    const state = this.activeDownloads.get(vodId);
    if (!state) throw new Error(`No download state found for VOD ${vodId}`);

    const queue = [...segments];
    const inProgress = new Set<Promise<void>>();

    while (queue.length > 0 || inProgress.size > 0) {
      while (queue.length > 0 && inProgress.size < maxConcurrent) {
        const segment = queue.shift();
        if (!segment) continue;

        const outputPath = path.join(tempDir, `segment-${segment.index}.ts`);
        const downloadPromise = this.downloadSegment(vodId, segment, outputPath, throttleSpeed)
          .then(() => {
            inProgress.delete(downloadPromise);
          })
          .catch((error) => {
            logger.error(`Error downloading segment ${segment.index}:`, error);
            inProgress.delete(downloadPromise);
            if (state.failedSegments.size < this.retryAttempts) {
              queue.push(segment);
            }
          });

        inProgress.add(downloadPromise);
      }

      if (inProgress.size > 0) {
        await Promise.race(Array.from(inProgress));
      }
    }
  }

  private async downloadChat(vodId: string, outputDir: string): Promise<void> {
    try {
      const chat = await this.twitchAPI.getVODChat(vodId);
      const outputPath = path.join(outputDir, 'chat.json');
      await fs.promises.writeFile(outputPath, JSON.stringify(chat, null, 2));
    } catch (error) {
      logger.error(`Error downloading chat for VOD ${vodId}:`, error);
      throw error;
    }
  }

  private async downloadMarkers(vodId: string, outputDir: string): Promise<void> {
    try {
      const markers = await this.twitchAPI.getVODMarkers(vodId);
      const outputPath = path.join(outputDir, 'markers.json');
      await fs.promises.writeFile(outputPath, JSON.stringify(markers, null, 2));
    } catch (error) {
      logger.error(`Error downloading markers for VOD ${vodId}:`, error);
      throw error;
    }
  }

  private async getVODPlaylist(vodId: string, preferredQuality: VideoQuality): Promise<SegmentedPlaylist> {
    const playlist = await this.twitchAPI.getVODPlaylist(vodId);
    if (!playlist) {
      throw new Error(`Failed to get playlist for VOD ${vodId}`);
    }

    const qualities = Object.entries(playlist.qualities).map(([quality, data]) => ({
      quality: quality as VideoQuality,
      segments: data.segments.map((segment, index) => ({
        index,
        url: segment.url,
        duration: segment.duration
      }))
    }));

    const selectedQuality = qualities.find(q => q.quality === preferredQuality) || qualities[0];
    if (!selectedQuality) {
      throw new Error('No suitable quality found for VOD');
    }

    return {
      segments: selectedQuality.segments,
      duration: playlist.duration,
      quality: selectedQuality.quality
    };
  }

  private async performPeriodicCleanup(): Promise<void> {
    try {
      const client = await this.pool.connect();
      try {
        // Clean up failed downloads older than 24 hours
        await client.query(`
          UPDATE vods 
          SET download_status = 'cancelled',
              error_message = 'Automatically cancelled due to failure',
              updated_at = NOW()
          WHERE download_status = 'failed'
          AND updated_at < NOW() - INTERVAL '24 hours'
        `);

        // Clean up temporary files
        const files = await fs.promises.readdir(this.tempDir);
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        for (const file of files) {
          const filePath = path.join(this.tempDir, file);
          const stats = await fs.promises.stat(filePath);
          const age = now - stats.mtimeMs;

          if (age > maxAge) {
            try {
              if (stats.isDirectory()) {
                await fs.promises.rm(filePath, { recursive: true, force: true });
              } else {
                await fs.promises.unlink(filePath);
              }
              logger.info(`Cleaned up old file/directory: ${file}`);
            } catch (error) {
              logger.error(`Error cleaning up file ${file}:`, error);
            }
          }
        }
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error performing periodic cleanup:', error);
    }
  }

  public async startProcessing(intervalSeconds: number = 30): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Cannot start processing while shutdown is in progress');
    }

    logger.info(`Starting download queue processing with ${intervalSeconds} second interval`);

    // Initial resource check
    await this.checkSystemResources();

    // Initial queue processing
    await this.processDownloadQueue();

    // Set up interval for continuous processing
    this.processingInterval = setInterval(() => {
      this.processDownloadQueue().catch(error => {
        logger.error('Error in download queue interval:', error);
      });
    }, intervalSeconds * 1000);
  }

  public async stopProcessing(timeoutMs: number = this.shutdownTimeout): Promise<void> {
    const startTime = Date.now();
    this.isShuttingDown = true;

    this.emit('shutdown:start');

    try {
      // Clear all intervals
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
      }

      if (this.resourceCheckInterval) {
        clearInterval(this.resourceCheckInterval);
        this.resourceCheckInterval = null;
      }

      // Handle active downloads
      const activeDownloadIds = Array.from(this.activeDownloads.keys());
      if (activeDownloadIds.length > 0) {
        logger.info(`Waiting for ${activeDownloadIds.length} active downloads to complete`);

        let remainingDownloads = activeDownloadIds.length;
        const shutdownInterval = setInterval(() => {
          const elapsedMs = Date.now() - startTime;
          this.emit('shutdown:progress', {
            remainingDownloads,
            completedCleanup: false,
            stage: 'stopping_downloads',
            elapsedMs
          });

          if (elapsedMs >= timeoutMs) {
            logger.warn('Shutdown timeout reached, forcing shutdown');
            clearInterval(shutdownInterval);
          }
        }, 1000);

        // Cancel all active downloads
        for (const vodId of activeDownloadIds) {
          try {
            await this.cancelDownload(vodId);
            remainingDownloads--;
          } catch (error) {
            logger.error(`Error cancelling download ${vodId} during shutdown:`, error);
          }
        }

        clearInterval(shutdownInterval);
      }

      // Cleanup stage
      this.emit('shutdown:progress', {
        remainingDownloads: 0,
        completedCleanup: false,
        stage: 'cleanup',
        elapsedMs: Date.now() - startTime
      });

      // Perform database cleanup
      await this.cleanupDatabaseState();

      // Clear resource tracking
      this.activeDownloads.clear();

      // Final cleanup of temp directory
      await this.cleanupTempDirectory();

      this.isShuttingDown = false;
      this.emit('shutdown:complete');

      logger.info(`Download queue processing stopped after ${Date.now() - startTime}ms`);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  private async cleanupDatabaseState(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update any stuck downloads
      await client.query(`
        UPDATE vods 
        SET download_status = 'failed',
            error_message = 'Download interrupted by system shutdown',
            updated_at = NOW()
        WHERE download_status IN ('downloading', 'queued')
      `);

      // Log shutdown event
      await client.query(`
        INSERT INTO system_events (
          event_type,
          details,
          created_at
        ) VALUES (
          'shutdown',
          $1,
          NOW()
        )
      `, [JSON.stringify({
        active_downloads: this.activeDownloads.size,
        total_bytes_downloaded: this.metrics.totalBytesDownloaded,
        uptime_ms: Date.now() - this.metrics.startTime
      })]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async cleanupTempDirectory(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.tempDir);
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        try {
          const stats = await fs.promises.stat(filePath);
          if (stats.isDirectory()) {
            await fs.promises.rm(filePath, { recursive: true, force: true });
          } else {
            await fs.promises.unlink(filePath);
          }
          logger.debug(`Cleaned up temp file: ${filePath}`);
        } catch (error) {
          logger.error(`Error cleaning up temp file ${filePath}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error during temp directory cleanup:', error);
      throw error;
    }
  }

public async destroy(): Promise<void> {
    try {
      await this.stopProcessing();

      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Clear all event listeners
      this.removeAllListeners();

      // Final metrics logging
      const uptime = Date.now() - this.metrics.startTime;
      logger.info('Download manager destroyed', {
        totalDownloads: this.metrics.totalDownloads,
        failedDownloads: this.metrics.failedDownloads,
        totalBytesDownloaded: this.metrics.totalBytesDownloaded,
        uptime,
        averageSpeed: this.metrics.averageSpeed
      });

      this.activeDownloads.clear();
    } catch (error) {
      logger.error('Error during download manager destruction:', error);
      throw error;
    }
  }

  private async processDownloadQueue(): Promise<void> {
    if (this.isShuttingDown) {
      logger.info('Skipping download queue processing during shutdown');
      return;
    }

    const client = await this.pool.connect();

    try {
      // Check system resources before processing
      const resources = await this.checkSystemResources();

      // Skip processing if resources are constrained
      if (
        resources.diskSpace.available < this.resourceThresholds.minDiskSpace ||
        (1 - resources.memoryUsage.free / resources.memoryUsage.total) > this.resourceThresholds.maxMemoryUsage
      ) {
        logger.warn('Skipping download queue processing due to resource constraints');
        return;
      }

      const result = await client.query(`
        SELECT id, twitch_id, preferred_quality,
               download_chat, download_markers, download_chapters
        FROM vods
        WHERE download_status = 'queued'
        AND (retry_count IS NULL OR retry_count < max_retries)
        ORDER BY
          CASE download_priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
          END,
          scheduled_for ASC
        LIMIT $1
      `, [this.maxConcurrent - this.activeDownloads.size]);

      for (const vod of result.rows) {
        if (this.isShuttingDown || this.activeDownloads.size >= this.maxConcurrent) break;

        const tempDir = path.join(this.tempDir, `vod-${vod.id}`);
        await fs.promises.mkdir(tempDir, { recursive: true });

        try {
          // Emit download start event
          this.emit('download:start', vod.id);

          const downloadStartTime = Date.now();
          const initialMemoryUsage = process.memoryUsage().heapUsed;

          const playlist = await this.getVODPlaylist(vod.twitch_id, vod.preferred_quality);
          if (!playlist) throw new Error('Failed to get VOD playlist');

          await client.query(
            `UPDATE vods
             SET download_status = 'downloading',
                 started_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [vod.id]
          );

          // Initialize download state with resource tracking
          const state = this.createDownloadState(vod.id, playlist.segments.length);
          state.resources = {
            startMemory: initialMemoryUsage,
            peakMemory: initialMemoryUsage,
            startTime: downloadStartTime,
            diskUsage: 0
          };
          this.activeDownloads.set(vod.id, state);

          // Start the download with progress tracking
          await this.downloadSegmentsInParallel(
            vod.id,
            playlist.segments,
            tempDir,
            3 // Default concurrent segments
          );

          // Download additional content if requested
          if (vod.download_chat) {
            await this.downloadChat(vod.twitch_id, tempDir);
          }

          if (vod.download_markers) {
            await this.downloadMarkers(vod.twitch_id, tempDir);
          }

          // Update metrics
          const downloadDuration = Date.now() - downloadStartTime;
          this.updateMetrics({
            totalDownloads: this.metrics.totalDownloads + 1,
            totalBytesDownloaded: this.metrics.totalBytesDownloaded + state.progress.bytesDownloaded,
            averageSpeed: state.progress.speed,
            peakMemoryUsage: Math.max(this.metrics.peakMemoryUsage, state.resources.peakMemory)
          });

          await client.query(
            `UPDATE vods
             SET download_status = 'completed',
                 completed_at = NOW(),
                 updated_at = NOW(),
                 download_stats = $2::jsonb
             WHERE id = $1`,
            [vod.id, JSON.stringify({
              duration_ms: downloadDuration,
              bytes_downloaded: state.progress.bytesDownloaded,
              average_speed: state.progress.speed,
              peak_memory_usage: state.resources.peakMemory - state.resources.startMemory,
              segments_downloaded: state.completedSegments.size
            })]
          );

          // Emit download complete event
          this.emit('download:complete', vod.id);

        } catch (error) {
          logger.error(`Error processing VOD ${vod.id}:`, error);

          // Emit download error event
          this.emit('download:error', {
            vodId: vod.id,
            error: error instanceof Error ? error : new Error(String(error)),
            attempt: (vod.retry_count || 0) + 1,
            maxAttempts: vod.max_retries
          });

          // Update metrics for failed download
          this.updateMetrics({
            failedDownloads: this.metrics.failedDownloads + 1
          });

          await this.handleDownloadError(vod.id,
            error instanceof Error ? error : new Error(String(error)),
            client
          );
        } finally {
          this.activeDownloads.delete(vod.id);
          if (fs.existsSync(tempDir)) {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
          }
        }
      }
    } catch (error) {
      logger.error('Error processing download queue:', error);
    } finally {
      client.release();
    }
  }

    public async getQueueStatus(): Promise<QueueStatus> {
      const client = await this.pool.connect();
      try {
        const result = await client.query(`
          SELECT 
            COUNT(CASE WHEN download_status = 'queued' THEN 1 END) as pending,
            COUNT(CASE WHEN download_status = 'downloading' THEN 1 END) as downloading,
            COUNT(CASE WHEN download_status = 'failed' THEN 1 END) as failed,
            COUNT(CASE WHEN download_status = 'completed' THEN 1 END) as completed
          FROM vods
          WHERE download_status IN ('queued', 'downloading', 'failed', 'completed')
        `);

        return {
          pending: parseInt(result.rows[0].pending) || 0,
          downloading: parseInt(result.rows[0].downloading) || 0,
          failed: parseInt(result.rows[0].failed) || 0,
          completed: parseInt(result.rows[0].completed) || 0
        };
      } finally {
        client.release();
      }
    }

    public async retryFailedDownload(vodId: number): Promise<void> {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        const result = await client.query(
          'SELECT id, retry_count, max_retries FROM vods WHERE id = $1',
          [vodId]
        );

        if (result.rows.length === 0) {
          throw new Error(`VOD ${vodId} not found`);
        }

        const vod = result.rows[0];
        if (vod.retry_count >= vod.max_retries) {
          throw new Error(`Maximum retry attempts reached for VOD ${vodId}`);
        }

        await client.query(
          `UPDATE vods 
           SET download_status = 'queued',
               retry_count = retry_count + 1,
               error_message = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [vodId]
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    public async cancelDownload(vodId: number): Promise<void> {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        const result = await client.query(
          'SELECT id FROM vods WHERE id = $1 AND download_status IN (\'queued\', \'downloading\')',
          [vodId]
        );

        if (result.rows.length === 0) {
          throw new Error(`No active download found for VOD ${vodId}`);
        }

        await client.query(
          `UPDATE vods 
           SET download_status = 'cancelled',
               error_message = 'Download cancelled by user',
               updated_at = NOW()
           WHERE id = $1`,
          [vodId]
        );

        // Remove from active downloads
        this.activeDownloads.delete(vodId);

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }


    private updateMetrics(update: Partial<typeof this.metrics>): void {
      Object.assign(this.metrics, update);
    }

    public getMetrics(): typeof this.metrics {
      return { ...this.metrics };
    }
  }

export default DownloadManager;

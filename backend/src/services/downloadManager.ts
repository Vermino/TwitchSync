// Filepath: backend/src/services/downloadManager.ts

import { Pool } from 'pg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { Transform, pipeline } from 'stream';
import { logger } from '../utils/logger';
import { TwitchAPIService } from './twitch/api';
import { VodStatus, VideoQuality, DownloadPriority } from '../types/database';

const pipelineAsync = promisify(pipeline);

interface VODDownloadOptions {
  quality?: VideoQuality;
  downloadChat?: boolean;
  downloadMarkers?: boolean;
  downloadChapters?: boolean;
  priority?: DownloadPriority;
  maxConcurrentSegments?: number;
  throttleSpeed?: number;
}

interface RawSegment {
  url: string;
  duration: number;
}

interface SegmentInfo {
  index: number;
  url: string;
  duration: number;
  checksum?: string;
}

interface PlaylistQuality {
  segments: RawSegment[];
  resolution?: {
    width: number;
    height: number;
  };
}

interface PlaylistInfo {
  qualities: Record<string, PlaylistQuality>;
  duration: number;
  selectedQuality?: VideoQuality;
}

interface SegmentedPlaylist {
  segments: SegmentInfo[];
  duration: number;
  quality: VideoQuality;
}

interface DownloadProgress {
  vodId: number;
  segmentIndex: number;
  totalSegments: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed: number;
  eta: number;
  status: VodStatus;
}

interface DownloadState {
  vodId: number;
  progress: DownloadProgress;
  resumePosition: number;
  activeSegments: Set<number>;
  completedSegments: Set<number>;
  failedSegments: Set<number>;
  checksums: Map<number, string>;
  throttle: {
    enabled: boolean;
    bytesPerSecond: number;
    lastCheck: number;
    bytesSinceLastCheck: number;
  };
}

class DownloadManager {
  private static instance: DownloadManager;
  private pool: Pool;
  private tempDir: string;
  private maxConcurrent: number;
  private activeDownloads: Map<number, DownloadState>;
  private retryAttempts: number;
  private retryDelay: number;
  private twitchAPI: TwitchAPIService;
  private cleanupInterval: NodeJS.Timeout;
  private readonly CHUNK_SIZE = 16384; // 16KB chunks for throttling

  private constructor(
    pool: Pool,
    config: {
      tempDir: string;
      maxConcurrent: number;
      retryAttempts: number;
      retryDelay: number;
      cleanupInterval: number;
    }
  ) {
    this.pool = pool;
    this.tempDir = config.tempDir;
    this.maxConcurrent = config.maxConcurrent;
    this.retryAttempts = config.retryAttempts;
    this.retryDelay = config.retryDelay;
    this.activeDownloads = new Map();

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    this.twitchAPI = TwitchAPIService.getInstance();

    this.cleanupInterval = setInterval(
      () => this.performPeriodicCleanup(),
      config.cleanupInterval * 1000
    );
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
      resumePosition: 0,
      activeSegments: new Set(),
      completedSegments: new Set(),
      failedSegments: new Set(),
      checksums: new Map(),
      throttle: {
        enabled: false,
        bytesPerSecond: 0,
        lastCheck: Date.now(),
        bytesSinceLastCheck: 0
      }
    };
  }

  private async getVODPlaylist(vodId: string, preferredQuality: VideoQuality): Promise<SegmentedPlaylist> {
    const playlist = await this.twitchAPI.getVODPlaylist(vodId);
    if (!playlist) {
      throw new Error(`Failed to get playlist for VOD ${vodId}`);
    }

    // Convert the raw playlist to our structured format
    const qualities = Object.entries(playlist.qualities).map(([quality, data]) => ({
      quality: quality as VideoQuality,
      segments: data.segments.map((segment, index) => ({
        index,
        url: segment.url,
        duration: segment.duration
      }))
    }));

    // Find best matching quality
    const selectedQuality = qualities.find(q => q.quality === preferredQuality)
      || qualities[0];

    if (!selectedQuality) {
      throw new Error('No suitable quality found for VOD');
    }

    return {
      segments: selectedQuality.segments,
      duration: playlist.duration,
      quality: selectedQuality.quality
    };
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

      // Create a pipeline chain
      let currentStream: NodeJS.ReadableStream = response.data;
      currentStream = currentStream.pipe(progressStream);

      if (throttleSpeed) {
        currentStream = currentStream.pipe(this.createThrottledStream(throttleSpeed));
      }

      // Final pipe to writer
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

  public async downloadVOD(vodId: string, options: VODDownloadOptions = {}): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create VOD entry
      const result = await client.query(
        `INSERT INTO vods (
          twitch_id,
          download_status,
          download_priority,
          preferred_quality,
          download_chat,
          download_markers,
          download_chapters,
          max_retries,
          created_at,
          updated_at
        ) VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id`,
        [
          vodId,
          options.priority || 'normal',
          options.quality || 'source',
          options.downloadChat || false,
          options.downloadMarkers || false,
          options.downloadChapters || false,
          this.retryAttempts
        ]
      );

      const downloadId = result.rows[0].id;

      // Get VOD playlist
      const playlist = await this.getVODPlaylist(vodId, options.quality || 'source');
      const tempDir = path.join(this.tempDir, `vod-${downloadId}`);
      await fs.promises.mkdir(tempDir, { recursive: true });

      // Initialize download state
      const state = this.createDownloadState(downloadId, playlist.segments.length);
      this.activeDownloads.set(downloadId, state);

      // Update status to downloading
      await client.query(
        `UPDATE vods 
         SET download_status = 'downloading',
             started_at = NOW()
         WHERE id = $1`,
        [downloadId]
      );

      await client.query('COMMIT');

      // Start download process
      try {
        await this.downloadSegmentsInParallel(
          downloadId,
          playlist.segments,
          tempDir,
          options.maxConcurrentSegments || 3,
          options.throttleSpeed
        );

        if (options.downloadChat) {
          await this.downloadChat(vodId, tempDir);
        }

        if (options.downloadMarkers) {
          await this.downloadMarkers(vodId, tempDir);
        }

        // Update status to completed
        await client.query(
          `UPDATE vods 
           SET download_status = 'completed',
               completed_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [downloadId]
        );

      } catch (error) {
        // Update status to failed
        await client.query(
          `UPDATE vods 
           SET download_status = 'failed',
               error_message = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [(error as Error).message, downloadId]
        );

        throw error;
      } finally {
        // Cleanup
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        this.activeDownloads.delete(downloadId);
      }

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

private async mergeSegments(vodId: number, segmentDir: string, outputPath: string): Promise<void> {
    const state = this.activeDownloads.get(vodId);
    if (!state) throw new Error(`No download state found for VOD ${vodId}`);

    try {
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

      const files = await fs.promises.readdir(segmentDir);
      const segmentFiles = files
        .filter(f => f.startsWith('segment-') && f.endsWith('.ts'))
        .sort((a, b) => {
          const indexA = parseInt(a.match(/segment-(\d+)\.ts/)?.[1] || '0');
          const indexB = parseInt(b.match(/segment-(\d+)\.ts/)?.[1] || '0');
          return indexA - indexB;
        });

      const outputStream = fs.createWriteStream(outputPath);

      for (const file of segmentFiles) {
        const segmentPath = path.join(segmentDir, file);
        const segmentData = await fs.promises.readFile(segmentPath);
        await new Promise<void>((resolve, reject) => {
          outputStream.write(segmentData, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }

      await new Promise<void>((resolve, reject) => {
        outputStream.end((error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      });

    } catch (error) {
      logger.error(`Error merging segments for VOD ${vodId}:`, error);
      throw error;
    }
  }

  public async addToQueue(
    vodId: number,
    priority: DownloadPriority = 'normal'
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check if VOD exists
      const vodExists = await client.query(
        'SELECT id FROM vods WHERE id = $1',
        [vodId]
      );

      if (vodExists.rows.length === 0) {
        throw new Error(`VOD with ID ${vodId} not found`);
      }

      // Update VOD status and priority
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


private async processDownloadQueue(): Promise<void> {
  const client = await this.pool.connect();

  try {
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
      if (this.activeDownloads.size >= this.maxConcurrent) break;

      const tempDir = path.join(this.tempDir, `vod-${vod.id}`);
      await fs.promises.mkdir(tempDir, { recursive: true });

      try {
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

        // Initialize download state
        const state = this.createDownloadState(vod.id, playlist.segments.length);
        this.activeDownloads.set(vod.id, state);

        // Start the download
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

        await client.query(
          `UPDATE vods 
           SET download_status = 'completed',
               completed_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [vod.id]
        );

      } catch (error) {
        logger.error(`Error processing VOD ${vod.id}:`, error);
        await client.query(
          `UPDATE vods 
           SET download_status = 'failed',
               error_message = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [(error instanceof Error ? error.message : 'Unknown error'), vod.id]
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

  public async retryFailedDownload(vodId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const vodResult = await client.query(
        `SELECT id, retry_count, max_retries 
         FROM vods 
         WHERE id = $1 AND download_status = 'failed'`,
        [vodId]
      );

      if (vodResult.rows.length === 0) {
        throw new Error(`Failed VOD ${vodId} not found`);
      }

      const vod = vodResult.rows[0];

      if (vod.retry_count >= vod.max_retries) {
        throw new Error(`Maximum retry attempts (${vod.max_retries}) reached for VOD ${vodId}`);
      }

      await client.query(
        `UPDATE vods 
         SET download_status = 'queued',
             error_message = NULL,
             retry_count = COALESCE(retry_count, 0) + 1,
             last_retry = NOW(),
             scheduled_for = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [vodId]
      );

      await client.query('COMMIT');

      // Trigger queue processing
      await this.processDownloadQueue();
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error retrying download for VOD ${vodId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  public async cancelDownload(vodId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const vodResult = await client.query(
        `SELECT id 
         FROM vods 
         WHERE id = $1 
         AND download_status IN ('queued', 'downloading')`,
        [vodId]
      );

      if (vodResult.rows.length === 0) {
        throw new Error(`Download for VOD ${vodId} not found or not cancellable`);
      }

      await client.query(
        `UPDATE vods 
         SET download_status = 'cancelled',
             error_message = 'Download cancelled by user',
             updated_at = NOW()
         WHERE id = $1`,
        [vodId]
      );

      // Remove from active downloads if present
      this.activeDownloads.delete(vodId);

      // Clean up temporary files
      const tempDir = path.join(this.tempDir, `vod-${vodId}`);
      if (fs.existsSync(tempDir)) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error cancelling download for VOD ${vodId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  public async getQueueStatus(): Promise<{
    pending: number;
    downloading: number;
    failed: number;
    completed: number;
  }> {
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
    } catch (error) {
      logger.error('Error getting queue status:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  public async getDownloadProgress(vodId: number): Promise<DownloadProgress | null> {
    const state = this.activeDownloads.get(vodId);
    return state ? state.progress : null;
  }

  public async resumeDownload(vodId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      const vodResult = await client.query(
        `SELECT id, download_status
         FROM vods
         WHERE id = $1 AND download_status IN ('failed', 'cancelled')`,
        [vodId]
      );

      if (vodResult.rows.length === 0) {
        throw new Error(`VOD ${vodId} not found or not resumable`);
      }

      // Reset the download status to queued
      await client.query(
        `UPDATE vods
         SET download_status = 'queued',
             error_message = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [vodId]
      );

      // Trigger queue processing
      await this.processDownloadQueue();
    } catch (error) {
      logger.error(`Error resuming download for VOD ${vodId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  public async pauseQueue(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(
        `UPDATE vods
         SET download_status = 'queued',
             updated_at = NOW()
         WHERE download_status = 'downloading'`
      );

      // Clear active downloads
      this.activeDownloads.clear();
    } catch (error) {
      logger.error('Error pausing download queue:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  public async resumeQueue(): Promise<void> {
    try {
      await this.processDownloadQueue();
    } catch (error) {
      logger.error('Error resuming download queue:', error);
      throw error;
    }
  }

  public async removeFailedDownloads(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(
        `DELETE FROM vods
         WHERE download_status = 'failed'
         AND updated_at < NOW() - INTERVAL '24 hours'`
      );
    } catch (error) {
      logger.error('Error removing failed downloads:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  public async startProcessing(intervalSeconds: number = 30): Promise<void> {
    logger.info(`Starting download queue processing with ${intervalSeconds} second interval`);

    // Initial queue processing
    await this.processDownloadQueue();

    // Set up interval for continuous processing
    setInterval(() => {
      this.processDownloadQueue().catch(error => {
        logger.error('Error in download queue interval:', error);
      });
    }, intervalSeconds * 1000);
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
            if (stats.isDirectory()) {
              await fs.promises.rm(filePath, { recursive: true, force: true });
            } else {
              await fs.promises.unlink(filePath);
            }
            logger.info(`Cleaned up old file/directory: ${file}`);
          }
        }
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error performing periodic cleanup:', error);
    }
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.activeDownloads.clear();
  }

    public static getInstance(
    pool: Pool,
    config: {
      tempDir: string;
      maxConcurrent: number;
      retryAttempts: number;
      retryDelay: number;
      cleanupInterval: number;
    }
  ): DownloadManager {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager(pool, config);
    }
    return DownloadManager.instance;
  }

}

export { DownloadManager };  // Changed to named export
export default DownloadManager;

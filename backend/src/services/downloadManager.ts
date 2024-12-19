// Filepath: backend/src/services/downloadManager.ts

import { Pool, PoolClient } from 'pg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { Transform, pipeline } from 'stream';
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
  activeSegments: Set<number>;
  completedSegments: Set<number>;
  failedSegments: Set<number>;
  checksums: Map<number, string>;
  resumePosition: number;
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
  private cleanupInterval: NodeJS.Timeout | null = null;

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
      }
    };
  }

   /**
   * Enhanced error handling for download failures
   */
  private async handleDownloadError(
    vodId: number,
    error: Error,
    client: PoolClient
  ): Promise<void> {
    try {
      await client.query('BEGIN');

      // Get current VOD status
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

      // Update VOD status
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

  /**
   * Enhanced progress tracking with detailed statistics
   */
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

  async getTaskVODStats(taskId: number): Promise<TaskVODStats> {
    const client = await this.pool.connect();
    try {
      // First get the basic stats
      const basicStats = await client.query(`
        SELECT 
          COUNT(*) as total_vods,
          COALESCE(SUM(file_size), 0) as total_size,
          COALESCE(AVG(EXTRACT(EPOCH FROM duration::interval)), 0) as average_duration,
          CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE COUNT(CASE WHEN download_status = 'completed' THEN 1 END)::float / COUNT(*)::float 
          END as success_rate
        FROM vods v
        WHERE v.channel_id IN (
          SELECT unnest(channel_ids) FROM tasks WHERE id = $1
        )
        OR v.game_id IN (
          SELECT unnest(game_ids) FROM tasks WHERE id = $1
        )
      `, [taskId]);

      // Get quality stats
      const qualityStats = await client.query(`
        SELECT jsonb_object_agg(preferred_quality, cnt) as vods_by_quality
        FROM (
          SELECT preferred_quality, COUNT(*) as cnt
          FROM vods v
          WHERE (
            v.channel_id IN (SELECT unnest(channel_ids) FROM tasks WHERE id = $1)
            OR v.game_id IN (SELECT unnest(game_ids) FROM tasks WHERE id = $1)
          )
          AND preferred_quality IS NOT NULL
          GROUP BY preferred_quality
        ) q
      `, [taskId]);

      // Get language stats
      const languageStats = await client.query(`
        SELECT jsonb_object_agg(language, cnt) as vods_by_language
        FROM (
          SELECT language, COUNT(*) as cnt
          FROM vods v
          WHERE (
            v.channel_id IN (SELECT unnest(channel_ids) FROM tasks WHERE id = $1)
            OR v.game_id IN (SELECT unnest(game_ids) FROM tasks WHERE id = $1)
          )
          AND language IS NOT NULL
          GROUP BY language
        ) l
      `, [taskId]);

      return {
        total_vods: parseInt(basicStats.rows[0]?.total_vods) || 0,
        total_size: parseInt(basicStats.rows[0]?.total_size) || 0,
        average_duration: parseFloat(basicStats.rows[0]?.average_duration) || 0,
        download_success_rate: parseFloat(basicStats.rows[0]?.success_rate) || 0,
        vods_by_quality: qualityStats.rows[0]?.vods_by_quality || {},
        vods_by_language: languageStats.rows[0]?.vods_by_language || {}
      };
    } catch (error) {
      logger.error('Error getting task VOD stats:', error);
      return {
        total_vods: 0,
        total_size: 0,
        average_duration: 0,
        download_success_rate: 0,
        vods_by_quality: {},
        vods_by_language: {}
      };
    } finally {
      client.release();
    }
  }

  async getTaskDetails(taskId: number): Promise<TaskDetails> {
    const client = await this.pool.connect();
    try {
      const [progress, storage, vodStats] = await Promise.all([
        this.getTaskProgress(taskId),
        this.getTaskStorage(taskId),
        this.getTaskVODStats(taskId)
      ]);

      return {
        id: taskId,
        task_id: taskId,
        progress,
        storage,
        vod_stats: vodStats,
        created_at: new Date(),
        updated_at: new Date()
      };
    } finally {
      client.release();
    }
  }

  private async getTaskProgress(taskId: number): Promise<TaskProgressInfo> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          COUNT(CASE WHEN v.download_status = 'completed' THEN 1 END) as completed,
          COUNT(*) as total,
          MAX(CASE WHEN v.download_status = 'downloading' THEN CONCAT(c.username, ':', v.title) END) as current_item
        FROM vods v
        LEFT JOIN channels c ON v.channel_id = c.id
        WHERE v.channel_id IN (
          SELECT unnest(channel_ids) FROM tasks WHERE id = $1
        )
        OR v.game_id IN (
          SELECT unnest(game_ids) FROM tasks WHERE id = $1
        )
      `, [taskId]);

      const row = result.rows[0];
      const percentage = row.total > 0 ? (row.completed / row.total) * 100 : 0;
      const current_item = row.current_item ? {
        type: 'channel' as const,
        name: row.current_item.split(':')[1],
        status: 'downloading' as const
      } : undefined;

      return {
        percentage,
        completed: parseInt(row.completed) || 0,
        total: parseInt(row.total) || 0,
        current_item
      };
    } finally {
      client.release();
    }
  }

  private async getTaskStorage(taskId: number): Promise<TaskStorageInfo> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        WITH task_vods AS (
          SELECT v.*
          FROM vods v
          WHERE v.channel_id IN (
            SELECT unnest(channel_ids) FROM tasks WHERE id = $1
          )
          OR v.game_id IN (
            SELECT unnest(game_ids) FROM tasks WHERE id = $1
          )
        )
        SELECT 
          COALESCE(SUM(file_size), 0) as used_space,
          COALESCE((SELECT storage_limit_gb * 1024 * 1024 * 1024 FROM tasks WHERE id = $1), 107374182400) as storage_limit
        FROM task_vods
      `, [taskId]);

      const row = result.rows[0];
      const used = parseInt(row.used_space) || 0;
      const limit = parseInt(row.storage_limit) || 100 * 1024 * 1024 * 1024; // Default 100GB

      return {
        used,
        limit,
        remaining: Math.max(0, limit - used)
      };
    } finally {
      client.release();
    }
  }

  async executeTask(taskId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get task information
      const taskResult = await client.query(`
        SELECT 
          t.*,
          json_agg(DISTINCT c.*) as channels,
          json_agg(DISTINCT g.*) as games
        FROM tasks t
        LEFT JOIN channels c ON c.id = ANY(t.channel_ids)
        LEFT JOIN games g ON g.id = ANY(t.game_ids)
        WHERE t.id = $1
        GROUP BY t.id
      `, [taskId]);

      if (taskResult.rows.length === 0) {
        throw new Error(`Task ${taskId} not found`);
      }

      const task = taskResult.rows[0];
      logger.info(`Starting execution of task ${taskId}`, {
        taskName: task.name,
        channelCount: task.channel_ids?.length || 0,
        gameCount: task.game_ids?.length || 0
      });

      // Update task status to running
      await client.query(`
        UPDATE tasks 
        SET status = 'running',
            last_run = NOW(),
            next_run = CASE 
              WHEN schedule_type = 'interval' THEN 
                NOW() + (schedule_value || ' seconds')::interval
              WHEN schedule_type = 'cron' THEN 
                NOW()
              ELSE NULL 
            END,
            updated_at = NOW()
        WHERE id = $1
      `, [taskId]);

      // Create task history entry
      await client.query(`
        INSERT INTO task_history (
          task_id, 
          status, 
          start_time, 
          details
        ) VALUES ($1, 'running', NOW(), $2)
      `, [taskId, {
        trigger: 'system',
        task_config: {
          channel_ids: task.channel_ids,
          game_ids: task.game_ids,
          preferred_quality: task.preferred_quality,
          storage_limit_gb: task.storage_limit_gb
        }
      }]);

      let successfulInserts = 0;
      let failedInserts = 0;
      let errors: Error[] = [];

      // Process channels
      if (task.channel_ids?.length > 0) {
        for (const channelId of task.channel_ids) {
          try {
            const channelResult = await client.query(
              'SELECT * FROM channels WHERE id = $1',
              [channelId]
            );

            if (channelResult.rows.length === 0) {
              logger.warn(`Channel ${channelId} not found, skipping`);
              continue;
            }

            const channel = channelResult.rows[0];
            logger.info(`Processing channel ${channel.username} for task ${taskId}`);

            // Get recent VODs for channel
            const channelVods = await this.twitchAPI.getChannelVODs(channel.twitch_id);
            logger.info(`Found ${channelVods.length} downloadable VODs for channel ${channel.twitch_id}`);

            for (const vod of channelVods) {
              try {
                // Apply task filters if configured
                if (task.conditions) {
                  const { language, minimum_views, duration_minutes } = task.conditions;

                  if (language && vod.language !== language) {
                    continue;
                  }

                  if (minimum_views && vod.view_count < minimum_views) {
                    continue;
                  }

                  if (duration_minutes) {
                    const vodDuration = this.parseDuration(vod.duration);
                    if (vodDuration < duration_minutes * 60) {
                      continue;
                    }
                  }
                }

                // Check if VOD already exists
                const existingVod = await client.query(`
                  SELECT id FROM vods 
                  WHERE task_id = $1 
                  AND channel_id = $2 
                  AND twitch_id = $3
                  AND NOT (status = 'failed' AND retry_count >= max_retries)
                `, [taskId, channelId, vod.id]);

                if (existingVod.rows.length === 0) {
                  // Check storage limits if configured
                  if (task.storage_limit_gb) {
                    const storageUsed = await this.getTaskStorageUsage(taskId);
                    const storageLimit = task.storage_limit_gb * 1024 * 1024 * 1024; // Convert GB to bytes

                    if (storageUsed >= storageLimit) {
                      logger.warn(`Storage limit reached for task ${taskId}, skipping remaining VODs`);
                      break;
                    }
                  }

                  await client.query(`
                    INSERT INTO vods (
                      task_id,
                      channel_id,
                      twitch_id,
                      title,
                      description,
                      duration,
                      language,
                      view_count,
                      download_status,
                      preferred_quality,
                      content_type,
                      published_at,
                      created_at,
                      updated_at,
                      download_priority,
                      retry_count,
                      max_retries,
                      processing_options,
                      retention_days
                    ) VALUES (
                      $1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10,
                      $11, NOW(), NOW(), $12, 0, $13,
                      $14::jsonb,
                      $15
                    )
                  `, [
                    taskId,
                    channelId,
                    vod.id,
                    vod.title,
                    vod.description,
                    vod.duration || '0:00:00',
                    vod.language,
                    vod.view_count,
                    task.preferred_quality || 'source',
                    vod.type,
                    vod.published_at,
                    task.priority || 'normal',
                    task.max_retries || 3,
                    JSON.stringify({
                      transcode: false,
                      extract_chat: true,
                      download_markers: true,
                      download_chapters: true
                    }),
                    task.retention_days
                  ]);
                  successfulInserts++;
                }
              } catch (error) {
                logger.error(`Error inserting VOD ${vod.id} for channel ${channelId}:`, error);
                errors.push(error instanceof Error ? error : new Error(String(error)));
                failedInserts++;
                continue;
              }
            }
          } catch (error) {
            logger.error(`Error processing channel ${channelId} for task ${taskId}:`, error);
            errors.push(error instanceof Error ? error : new Error(String(error)));
            continue;
          }
        }
      }

      // Process games
      if (task.game_ids?.length > 0) {
        for (const gameId of task.game_ids) {
          try {
            const gameResult = await client.query(
              'SELECT * FROM games WHERE id = $1',
              [gameId]
            );

            if (gameResult.rows.length === 0) {
              logger.warn(`Game ${gameId} not found, skipping`);
              continue;
            }

            const game = gameResult.rows[0];
            logger.info(`Processing game ${game.name} for task ${taskId}`);

            const gameVods = await this.twitchAPI.getGameVODs(game.twitch_game_id);
            logger.info(`Found ${gameVods.length} downloadable VODs for game ${game.twitch_game_id}`);

            for (const vod of gameVods) {
              try {
                // Apply task filters if configured
                if (task.conditions) {
                  const { language, minimum_views, duration_minutes } = task.conditions;

                  if (language && vod.language !== language) {
                    continue;
                  }

                  if (minimum_views && vod.view_count < minimum_views) {
                    continue;
                  }

                  if (duration_minutes) {
                    const vodDuration = this.parseDuration(vod.duration);
                    if (vodDuration < duration_minutes * 60) {
                      continue;
                    }
                  }
                }

                // Check storage limits
                if (task.storage_limit_gb) {
                  const storageUsed = await this.getTaskStorageUsage(taskId);
                  const storageLimit = task.storage_limit_gb * 1024 * 1024 * 1024;

                  if (storageUsed >= storageLimit) {
                    logger.warn(`Storage limit reached for task ${taskId}, skipping remaining VODs`);
                    break;
                  }
                }

                const existingVod = await client.query(`
                  SELECT id FROM vods 
                  WHERE task_id = $1 
                  AND game_id = $2 
                  AND twitch_id = $3
                  AND NOT (status = 'failed' AND retry_count >= max_retries)
                `, [taskId, gameId, vod.id]);

                if (existingVod.rows.length === 0) {
                  await client.query(`
                    INSERT INTO vods (
                      task_id,
                      channel_id,
                      game_id,
                      twitch_id,
                      title,
                      description,
                      duration,
                      language,
                      view_count,
                      download_status,
                      preferred_quality,
                      content_type,
                      published_at,
                      created_at,
                      updated_at,
                      download_priority,
                      retry_count,
                      max_retries,
                      processing_options,
                      retention_days
                    ) VALUES (
                      $1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11,
                      $12, NOW(), NOW(), $13, 0, $14,
                      $15::jsonb,
                      $16
                    )
                  `, [
                    taskId,
                    vod.channel_id,
                    gameId,
                    vod.id,
                    vod.title,
                    vod.description,
                    vod.duration || '0:00:00',
                    vod.language,
                    vod.view_count,
                    task.preferred_quality || 'source',
                    vod.type,
                    vod.published_at,
                    task.priority || 'normal',
                    task.max_retries || 3,
                    JSON.stringify({
                      transcode: false,
                      extract_chat: true,
                      download_markers: true,
                      download_chapters: true
                    }),
                    task.retention_days
                  ]);
                  successfulInserts++;
                }
              } catch (error) {
                logger.error(`Error inserting VOD ${vod.id} for game ${gameId}:`, error);
                errors.push(error instanceof Error ? error : new Error(String(error)));
                failedInserts++;
                continue;
              }
            }
          } catch (error) {
            logger.error(`Error processing game ${gameId} for task ${taskId}:`, error);
            errors.push(error instanceof Error ? error : new Error(String(error)));
            continue;
          }
        }
      }

      // Determine final task status
      let finalStatus = 'completed';
      let errorMessage: string | null = null;

      if (failedInserts > 0 && successfulInserts === 0) {
        finalStatus = 'failed';
        errorMessage = errors.map(e => e.message).join('; ');
      } else if (failedInserts > 0) {
        finalStatus = 'completed_with_errors';
        errorMessage = `Completed with ${failedInserts} failed inserts`;
      }

      // Update task status
      await client.query(`
        UPDATE tasks 
        SET status = $1,
            error_message = $2,
            last_run = NOW(),
            next_run = CASE 
              WHEN schedule_type = 'interval' THEN 
                NOW() + (schedule_value || ' seconds')::interval
              WHEN schedule_type = 'cron' THEN 
                NOW()
              ELSE NULL 
            END,
            updated_at = NOW()
        WHERE id = $3
      `, [finalStatus, errorMessage, taskId]);

      // Update task history
      await client.query(`
        UPDATE task_history
        SET status = $1,
            end_time = NOW(),
            details = jsonb_set(
              COALESCE(details, '{}'::jsonb),
              '{execution_summary}',
              $2::jsonb
            )
        WHERE task_id = $3
        AND end_time IS NULL
      `, [
        finalStatus,
        JSON.stringify({
          successful_inserts: successfulInserts,
          failed_inserts: failedInserts,
          error_count: errors.length,
          completion_time: new Date().toISOString()
        }),
        taskId
      ]);

      await client.query('COMMIT');

      logger.info(`Task ${taskId} execution completed`, {
        taskId,
        status: finalStatus,
        successfulInserts,
        failedInserts
      });

    } catch (error) {
      logger.error(`Error during task execution:`, error);

      try {
        // Rollback the transaction
        await client.query('ROLLBACK');

        // Update task status to failed outside the failed transaction
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during task execution';
        await this.pool.query(`
          UPDATE tasks 
          SET status = 'failed',
              error_message = $2,
              updated_at = NOW(),
              last_run = NOW()
          WHERE id = $1
        `, [taskId, errorMessage]);

        // Update task history
        await this.pool.query(`
          UPDATE task_history
          SET status = 'failed',
              end_time = NOW(),
              details = jsonb_set(
                COALESCE(details, '{}'::jsonb),
                '{error}',
                $2::jsonb
              )
          WHERE task_id = $1
          AND end_time IS NULL
        `, [
          taskId,
          JSON.stringify({
            error: errorMessage,
            error_time: new Date().toISOString(),
            stack_trace: error instanceof Error ? error.stack : undefined
          })
        ]);

        // Cleanup any orphaned VODs
        await this.pool.query(`
          DELETE FROM vods
          WHERE task_id = $1
          AND created_at > (
            SELECT start_time
            FROM task_history
            WHERE task_id = $1
            AND end_time IS NULL
            ORDER BY start_time DESC
            LIMIT 1
          )
        `, [taskId]);

        throw error;
      } catch (rollbackError) {
        logger.error('Error during rollback:', rollbackError);
        throw rollbackError;
      }
    } finally {
      client.release();
    }
  }

  private parseDuration(duration: string): number {
    // Parse Twitch duration format (e.g., "1h2m3s") to seconds
    const hours = duration.match(/(\d+)h/)?.[1] || '0';
    const minutes = duration.match(/(\d+)m/)?.[1] || '0';
    const seconds = duration.match(/(\d+)s/)?.[1] || '0';

    return (
      parseInt(hours) * 3600 +
      parseInt(minutes) * 60 +
      parseInt(seconds)
    );
  }

  private async getTaskStorageUsage(taskId: number): Promise<number> {
    const result = await this.pool.query(`
      SELECT COALESCE(SUM(file_size), 0) as total_size
      FROM vods
      WHERE task_id = $1
      AND download_status = 'completed'
    `, [taskId]);

    return parseInt(result.rows[0].total_size) || 0;
  }

  private async updateTaskProgress(
    taskId: number,
    progress: {
      completed: number;
      total: number;
      current_item?: {
        type: 'channel' | 'game';
        name: string;
        status: string;
      };
    }
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        UPDATE tasks
        SET progress = $1::jsonb,
            updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(progress), taskId]);
    } finally {
      client.release();
    }
  }

  private async shouldProcessVOD(
    vod: any,
    task: any,
    storageUsed: number
  ): Promise<{
    should_process: boolean;
    skip_reason?: string;
  }> {
    // Check task conditions if configured
    if (task.conditions) {
      const { language, minimum_views, duration_minutes } = task.conditions;

      if (language && vod.language !== language) {
        return {
          should_process: false,
          skip_reason: 'Language mismatch'
        };
      }

      if (minimum_views && vod.view_count < minimum_views) {
        return {
          should_process: false,
          skip_reason: 'Below minimum views threshold'
        };
      }

      if (duration_minutes) {
        const vodDuration = this.parseDuration(vod.duration);
        if (vodDuration < duration_minutes * 60) {
          return {
            should_process: false,
            skip_reason: 'Below minimum duration'
          };
        }
      }
    }

    // Check storage limits
    if (task.storage_limit_gb) {
      const storageLimit = task.storage_limit_gb * 1024 * 1024 * 1024;
      if (storageUsed >= storageLimit) {
        return {
          should_process: false,
          skip_reason: 'Storage limit reached'
        };
      }
    }

    return { should_process: true };
  }

  private async checkVODExists(
    taskId: number,
    channelId: number | null,
    gameId: number | null,
    twitchId: string
  ): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT id 
      FROM vods 
      WHERE task_id = $1 
      AND twitch_id = $2
      AND (
        ($3::int IS NOT NULL AND channel_id = $3)
        OR 
        ($4::int IS NOT NULL AND game_id = $4)
      )
      AND NOT (status = 'failed' AND retry_count >= max_retries)
    `, [taskId, twitchId, channelId, gameId]);

    return result.rows.length > 0;
  }

  private getProcessingOptions(task: any): any {
    return {
      transcode: false,
      extract_chat: true,
      download_markers: true,
      download_chapters: true,
      custom_options: task.processing_options || {}
    };
  }

  private async logTaskEvent(
    taskId: number,
    event: string,
    details: any
  ): Promise<void> {
    await this.pool.query(`
      INSERT INTO task_events (
        task_id,
        event_type,
        details,
        created_at
      ) VALUES ($1, $2, $3::jsonb, NOW())
    `, [taskId, event, JSON.stringify(details)]);
  }

  private async cleanupFailedTask(
    taskId: number,
    error: Error
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update task status
      await client.query(`
        UPDATE tasks 
        SET status = 'failed',
            error_message = $2,
            updated_at = NOW(),
            last_run = NOW()
        WHERE id = $1
      `, [taskId, error.message]);

      // Update task history
      await client.query(`
        UPDATE task_history
        SET status = 'failed',
            end_time = NOW(),
            details = jsonb_set(
              COALESCE(details, '{}'::jsonb),
              '{error}',
              $2::jsonb
            )
        WHERE task_id = $1
        AND end_time IS NULL
      `, [
        taskId,
        JSON.stringify({
          error: error.message,
          error_time: new Date().toISOString(),
          stack_trace: error.stack
        })
      ]);

      // Clean up any orphaned VODs
      await client.query(`
        DELETE FROM vods
        WHERE task_id = $1
        AND created_at > (
          SELECT start_time
          FROM task_history
          WHERE task_id = $1
          AND end_time IS NULL
          ORDER BY start_time DESC
          LIMIT 1
        )
      `, [taskId]);

      await client.query('COMMIT');
    } catch (cleanupError) {
      await client.query('ROLLBACK');
      logger.error('Error during task cleanup:', cleanupError);
    } finally {
      client.release();
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
      this.cleanupInterval = null;
    }
    this.activeDownloads.clear();
  }
}

export { DownloadManager };
export default DownloadManager;

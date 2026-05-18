// Filepath: backend/src/services/downloadManager/queue/queueProcessor.ts

import { Pool, PoolClient } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger';
import { ResourceMonitor } from '../utils/resourceMonitor';
import { DownloadHandler } from '../handlers/downloadHandler';
import { QueueStatus } from '../types';

interface ChannelRow {
  twitch_id: string;
}

interface VodRow {
  twitch_id: string;
  id: number;
  task_id: number;
  download_status: string;
  channel_id: number;
}

interface TaskRow {
  id: number;
  channel_ids: number[];
  game_ids: number[];
}

export class QueueProcessor extends EventEmitter {
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private isShuttingDown: boolean = false;

  constructor(
    private pool: Pool,
    private downloadHandler: DownloadHandler,
    private resourceMonitor: ResourceMonitor,
    private maxConcurrent: number
  ) {
    super();
  }

  async startProcessing(intervalSeconds: number = 30): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Cannot start processing while shutdown is in progress');
    }

    logger.info(`Starting download queue processing with ${intervalSeconds} second interval`);

    // Initial resource check
    await this.resourceMonitor.getSystemResources();

    // Initial queue processing (spawned asynchronously so it doesn't block server startup)
    this.processQueue().catch(error => {
      logger.error('Error in initial queue processing:', error);
    });

    // Set up interval for continuous processing
    this.processingInterval = setInterval(() => {
      this.processQueue().catch(error => {
        logger.error('Error in download queue interval:', error);
      });
    }, intervalSeconds * 1000);
  }

  async stopProcessing(): Promise<void> {
    this.isShuttingDown = true;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Wait for current processing to complete (with timeout)
    if (this.isProcessing) {
      logger.info('Waiting for current queue processing to complete...');
      await new Promise<void>(resolve => {
        let attempts = 0;
        const maxAttempts = 10; // 10 second timeout

        const checkInterval = setInterval(() => {
          attempts++;
          if (!this.isProcessing || attempts >= maxAttempts) {
            if (attempts >= maxAttempts && this.isProcessing) {
              logger.warn('Forcing queue processor stop after timeout');
              this.isProcessing = false; // Force reset the state
            }
            clearInterval(checkInterval);
            resolve();
          }
        }, 1000);
      });
    }

    this.isShuttingDown = false;
    logger.info('Queue processing stopped');
  }

  public async processQueue(): Promise<void> {
    if (this.isShuttingDown || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const client = await this.pool.connect();

    try {
      // Check system resources
      const resources = await this.resourceMonitor.getSystemResources();
      const activeDownloads = this.downloadHandler.getActiveDownloads();

      // Skip if resources are constrained
      if (
        resources.diskSpace.available < 10 * 1024 * 1024 * 1024 || // 10GB
        resources.memoryUsage.free / resources.memoryUsage.total < 0.1 // 10% free memory
      ) {
        logger.warn('Skipping queue processing due to resource constraints');
        return;
      }

      // First, check for any tasks that need VOD discovery
      const discoveryResult = await client.query<TaskRow>(`
        SELECT t.id, t.channel_ids, t.game_ids
        FROM tasks t
        WHERE t.status = 'running'
        AND t.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM vods v
          WHERE v.task_id = t.id
          AND v.download_status IN ('queued', 'downloading')
        )
      `);

      // Process VOD discovery for each task
      for (const task of discoveryResult.rows) {
        try {
          await this.processTaskVODs(task.id, task.channel_ids, task.game_ids, client);
        } catch (error) {
          logger.error(`Error processing VODs for task ${task.id}:`, error);
        }
      }

      // Get next batch of VODs to process
      const result = await client.query<VodRow>(`
        SELECT v.*, t.priority as task_priority
        FROM vods v
        LEFT JOIN tasks t ON v.task_id = t.id
        WHERE v.download_status = 'queued'
        AND t.status IN ('running', 'downloading')
        AND (v.retry_count IS NULL OR v.retry_count < v.max_retries)
        ORDER BY
          CASE v.download_priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
          END,
          v.scheduled_for ASC
        LIMIT $1
      `, [this.maxConcurrent - activeDownloads.size]);

      logger.info(`QueueProcessor debug: activeDownloads=${activeDownloads.size}, maxConcurrent=${this.maxConcurrent}, found ${result.rows.length} queued VODs to process`);

      for (const vod of result.rows) {
        try {
          // Emit download start event
          this.emit('download:start', vod.id);

          // Start the download
          await this.downloadHandler.processVOD(vod);

          // Emit download complete event
          this.emit('download:complete', vod.id);
        } catch (error) {
          logger.error(`Error processing VOD ${vod.id}:`, error);
          this.emit('download:error', {
            vodId: vod.id,
            error: error instanceof Error ? error : new Error(String(error))
          });
        }
      }
    } catch (error) {
      logger.error('Error processing download queue:', error);
    } finally {
      this.isProcessing = false;
      client.release();
    }
  }

  private async processTaskVODs(
    taskId: number,
    channelIds: number[],
    gameIds: number[],
    client: PoolClient
  ): Promise<void> {
    // Get channel Twitch IDs
    const channelResult = await client.query<ChannelRow>(`
      SELECT twitch_id FROM channels WHERE id = ANY($1)
    `, [channelIds]);

    const twitchIds = channelResult.rows.map((row: ChannelRow) => row.twitch_id);

    // Update task monitoring status
    await client.query(`
      UPDATE task_monitoring
      SET status = 'discovering',
          status_message = 'Discovering new VODs',
          updated_at = NOW()
      WHERE task_id = $1
    `, [taskId]);

    // For each channel, fetch and queue VODs
    for (const twitchId of twitchIds) {
      try {
        // Check for VODs in the last 24 hours
        const vodResult = await client.query<VodRow>(`
          SELECT v.twitch_id
          FROM vods v
          JOIN channels c ON v.channel_id = c.id
          WHERE c.twitch_id = $1
          AND v.created_at > NOW() - INTERVAL '24 hours'
        `, [twitchId]);

        const existingVodIds = new Set(
          vodResult.rows.map((row: VodRow) => row.twitch_id)
        );

        // VODs are already queued by task handler, we don't need to insert them here
        logger.debug(`Processed channel ${twitchId} for task ${taskId}`);
      } catch (error) {
        logger.error(`Error processing VODs for channel ${twitchId}:`, error);
      }
    }

    // Update task monitoring status
    await client.query(`
      UPDATE task_monitoring
      SET status = 'running',
          status_message = 'VODs discovered and queued',
          updated_at = NOW()
      WHERE task_id = $1
    `, [taskId]);
  }

  async triggerImmediateProcessing(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    logger.info('Triggering immediate queue processing');
    setImmediate(() => {
      this.processQueue().catch(error => {
        logger.error('Error in triggered queue processing:', error);
      });
    });
  }

  async getQueueStatus(): Promise<QueueStatus> {
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
}

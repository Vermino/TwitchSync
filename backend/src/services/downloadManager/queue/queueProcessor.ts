// Filepath: backend/src/services/downloadManager/queue/queueProcessor.ts

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger';
import { ResourceMonitor } from '../utils/resourceMonitor';
import { DownloadHandler } from '../handlers/downloadHandler';
import { QueueStatus } from '../types';

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

    // Initial queue processing
    await this.processQueue();

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

    // Wait for current processing to complete
    if (this.isProcessing) {
      logger.info('Waiting for current queue processing to complete...');
      await new Promise<void>(resolve => {
        const checkInterval = setInterval(() => {
          if (!this.isProcessing) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 1000);
      });
    }

    this.isShuttingDown = false;
    logger.info('Queue processing stopped');
  }

  private async processQueue(): Promise<void> {
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

      // Get next batch of VODs to process
      const result = await client.query(`
        SELECT v.*, t.priority as task_priority
        FROM vods v
        LEFT JOIN tasks t ON v.task_id = t.id
        WHERE v.download_status = 'queued'
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

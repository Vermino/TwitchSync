// backend/src/services/downloadManager.ts

import { Pool } from 'pg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

interface DownloadTask {
  id: number;
  twitch_id: string;
  channel_id: number;
  download_priority: 'low' | 'normal' | 'high' | 'critical';
  preferred_quality: string;
  download_chat: boolean;
  download_markers: boolean;
}

interface DownloadError extends Error {
  message: string;
}

class DownloadManager {
  private pool: Pool;
  private tempDir: string;
  private maxConcurrent: number;
  private activeDownloads: Set<number>;
  private retryAttempts: number;
  private retryDelay: number;
  private static instance: DownloadManager;

  private constructor(
    pool: Pool,
    config: {
      tempDir: string;
      maxConcurrent: number;
      retryAttempts: number;
      retryDelay: number;
    }
  ) {
    this.pool = pool;
    this.tempDir = config.tempDir;
    this.maxConcurrent = config.maxConcurrent;
    this.retryAttempts = config.retryAttempts;
    this.retryDelay = config.retryDelay;
    this.activeDownloads = new Set();

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public static getInstance(
    pool: Pool,
    config: {
      tempDir: string;
      maxConcurrent: number;
      retryAttempts: number;
      retryDelay: number;
    }
  ): DownloadManager {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager(pool, config);
    }
    return DownloadManager.instance;
  }

  async addToQueue(
    vodId: number,
    priority: 'low' | 'normal' | 'high' | 'critical' = 'normal'
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
             scheduled_for = CURRENT_TIMESTAMP,
             retry_count = 0
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

  private async processDownload(vod: DownloadTask): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Update status to downloading
      await client.query(
        `UPDATE vods 
         SET download_status = 'downloading',
             started_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [vod.id]
      );

      const tempFilePath = path.join(this.tempDir, `${vod.twitch_id}.mp4`);

      // Download the file
      const response = await axios({
        method: 'GET',
        url: vod.twitch_id,
        responseType: 'stream',
      });

      const writer = fs.createWriteStream(tempFilePath);
      let downloadedSize = 0;
      const totalSize = parseInt(response.headers['content-length'], 10);

      response.data.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        const progress = (downloadedSize / totalSize) * 100;

        // Update download progress
        client.query(
          `UPDATE vods 
           SET download_progress = $1,
               downloaded_size = $2,
               download_speed = $3
           WHERE id = $4`,
          [progress, downloadedSize, chunk.length, vod.id]
        ).catch(error => {
          logger.error(`Error updating download progress for VOD ${vod.id}:`, error);
        });
      });

      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const fileSize = fs.statSync(tempFilePath).size;

      // Mark download as completed
      await client.query(
        `UPDATE vods 
         SET download_status = 'completed',
             download_progress = 100,
             downloaded_size = $1,
             file_size = $1,
             download_path = $2,
             downloaded_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [fileSize, tempFilePath, vod.id]
      );

      logger.info(`Successfully downloaded VOD ${vod.id}`);
    } catch (error: unknown) {
      logger.error(`Error downloading VOD ${vod.id}:`, error);

      // Update status to failed
      await client.query(
        `UPDATE vods 
         SET download_status = 'failed',
             error_message = $1,
             retry_count = COALESCE(retry_count, 0) + 1,
             last_retry = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [(error instanceof Error) ? error.message : 'Unknown error occurred', vod.id]
      );

      // If max retries reached, mark as permanently failed
      const vodInfo = await client.query(
        'SELECT retry_count, max_retries FROM vods WHERE id = $1',
        [vod.id]
      );

      if (vodInfo.rows[0].retry_count >= vodInfo.rows[0].max_retries) {
        await client.query(
          `UPDATE vods 
           SET download_status = 'failed',
               error_message = 'Max retry attempts reached'
           WHERE id = $1`,
          [vod.id]
        );
      }
    } finally {
      this.activeDownloads.delete(vod.id);
      client.release();
    }
  }

  private async processQueue(): Promise<void> {
    try {
      // Get pending downloads
      const result = await this.pool.query(
        `SELECT id, twitch_id, channel_id, download_priority,
                preferred_quality, download_chat, download_markers
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
         LIMIT $1`,
        [this.maxConcurrent - this.activeDownloads.size]
      );

      for (const vod of result.rows) {
        if (this.activeDownloads.size >= this.maxConcurrent) {
          break;
        }

        this.activeDownloads.add(vod.id);
        this.processDownload(vod).catch(error => {
          logger.error(`Error processing download task for VOD ${vod.id}:`, error);
        });
      }
    } catch (error) {
      logger.error('Error processing download queue:', error);
    }
  }

  async startProcessing(intervalSeconds: number = 30): Promise<void> {
    logger.info(`Starting download queue processing with ${intervalSeconds} second interval`);

    setInterval(() => {
      this.processQueue().catch(error => {
        logger.error('Error in download queue interval:', error);
      });
    }, intervalSeconds * 1000);

    // Initial queue processing
    await this.processQueue();
  }

  async retryFailedDownload(vodId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check if VOD exists and is failed
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

      // Reset status and update retry count
      await client.query(
        `UPDATE vods 
         SET download_status = 'queued',
             error_message = NULL,
             retry_count = COALESCE(retry_count, 0) + 1,
             last_retry = CURRENT_TIMESTAMP,
             scheduled_for = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [vodId]
      );

      await client.query('COMMIT');

      // Trigger immediate queue processing
      await this.processQueue();
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error retrying download for VOD ${vodId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelDownload(vodId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check if download exists and is cancellable
      const result = await client.query(
        `SELECT id 
         FROM vods 
         WHERE id = $1 
         AND download_status IN ('queued', 'downloading')`,
        [vodId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Download for VOD ${vodId} not found or not cancellable`);
      }

      // Update status to cancelled
      await client.query(
        `UPDATE vods 
         SET download_status = 'cancelled',
             error_message = 'Download cancelled by user',
             download_progress = 0
         WHERE id = $1`,
        [vodId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error cancelling download for VOD ${vodId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getQueueStatus(): Promise<{
    pending: number;
    downloading: number;
    failed: number;
  }> {
    try {
      const result = await this.pool.query(`
        SELECT 
          COUNT(CASE WHEN download_status = 'queued' THEN 1 END) as pending,
          COUNT(CASE WHEN download_status = 'downloading' THEN 1 END) as downloading,
          COUNT(CASE WHEN download_status = 'failed' THEN 1 END) as failed
        FROM vods
        WHERE download_status IN ('queued', 'downloading', 'failed')
      `);

      return {
        pending: parseInt(result.rows[0].pending) || 0,
        downloading: parseInt(result.rows[0].downloading) || 0,
        failed: parseInt(result.rows[0].failed) || 0,
      };
    } catch (error) {
      logger.error('Error getting queue status:', error);
      throw error;
    }
  }

  async cleanupTempFiles(maxAgeHours: number = 24): Promise<void> {
    try {
      const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          fs.unlinkSync(filePath);
          logger.info(`Cleaned up temp file: ${file}`);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up temp files:', error);
      throw error;
    }
  }

  async pauseQueue(): Promise<void> {
    try {
      await this.pool.query(
        "UPDATE vods SET download_status = 'queued' WHERE download_status = 'downloading'"
      );
      this.activeDownloads.clear();
    } catch (error) {
      logger.error('Error pausing queue:', error);
      throw error;
    }
  }

  async resumeQueue(): Promise<void> {
    try {
      await this.processQueue();
    } catch (error) {
      logger.error('Error resuming queue:', error);
      throw error;
    }
  }
}

export default DownloadManager;

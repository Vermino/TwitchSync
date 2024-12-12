import { Pool } from 'pg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

interface DownloadTask {
  id: number;
  vod_id: number;
  chapter_id: number | null;
  priority: number;
  status: string;
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
    chapterId: number | null = null,
    priority: number = 1
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

      // Check if already in queue
      const queueCheck = await client.query(
        'SELECT id FROM download_queue WHERE vod_id = $1 AND (chapter_id = $2 OR ($2 IS NULL AND chapter_id IS NULL))',
        [vodId, chapterId]
      );

      if (queueCheck.rows.length === 0) {
        // Add to queue
        await client.query(
          `INSERT INTO download_queue (
            vod_id, chapter_id, priority, status
          ) VALUES ($1, $2, $3, $4)`,
          [vodId, chapterId, priority, 'pending']
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding to download queue:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async processDownload(task: DownloadTask): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Get VOD information
      const vodResult = await client.query(
        'SELECT twitch_vod_id, url FROM vods WHERE id = $1',
        [task.vod_id]
      );

      if (vodResult.rows.length === 0) {
        throw new Error(`VOD ${task.vod_id} not found`);
      }

      const vod = vodResult.rows[0];
      const tempFilePath = path.join(this.tempDir, `${vod.twitch_vod_id}.mp4`);

      // Update status to downloading
      await client.query(
        'UPDATE download_queue SET status = $1 WHERE id = $2',
        ['downloading', task.id]
      );

      // Download the file
      const response = await axios({
        method: 'GET',
        url: vod.url,
        responseType: 'stream',
      });

      const writer = fs.createWriteStream(tempFilePath);

      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Record successful download
      await client.query(
        `INSERT INTO vod_downloads (
          vod_id, download_path, download_status,
          started_at, completed_at, file_size
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4)`,
        [task.vod_id, tempFilePath, 'completed', fs.statSync(tempFilePath).size]
      );

      // Remove from queue
      await client.query(
        'DELETE FROM download_queue WHERE id = $1',
        [task.id]
      );

      logger.info(`Successfully downloaded VOD ${task.vod_id}`);
    } catch (error) {
      logger.error(`Error downloading VOD ${task.vod_id}:`, error);

      // Update queue status
      await client.query(
        'UPDATE download_queue SET status = $1, error_message = $2 WHERE id = $3',
        ['failed', error.message, task.id]
      );

      // Record failed download
      await client.query(
        `INSERT INTO vod_downloads (
          vod_id, download_status, started_at,
          completed_at, error_message
        ) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3)`,
        [task.vod_id, 'failed', error.message]
      );
    } finally {
      this.activeDownloads.delete(task.id);
      client.release();
    }
  }

  private async processQueue(): Promise<void> {
    try {
      // Get pending downloads
      const result = await this.pool.query(
        `SELECT * FROM download_queue 
         WHERE status = 'pending' 
         ORDER BY priority DESC, created_at ASC 
         LIMIT $1`,
        [this.maxConcurrent - this.activeDownloads.size]
      );

      for (const task of result.rows) {
        if (this.activeDownloads.size >= this.maxConcurrent) {
          break;
        }

        this.activeDownloads.add(task.id);
        this.processDownload(task).catch(error => {
          logger.error(`Error processing download task ${task.id}:`, error);
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

  async retryFailedDownload(downloadId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get failed download info
      const result = await client.query(
        `SELECT vod_id, chapter_id 
         FROM download_queue 
         WHERE id = $1 AND status = 'failed'`,
        [downloadId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Failed download ${downloadId} not found`);
      }

      // Reset status and clear error
      await client.query(
        `UPDATE download_queue 
         SET status = 'pending', 
             error_message = NULL, 
             retry_count = COALESCE(retry_count, 0) + 1 
         WHERE id = $1`,
        [downloadId]
      );

      await client.query('COMMIT');

      // Trigger immediate queue processing
      await this.processQueue();
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error retrying download ${downloadId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelDownload(downloadId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check if download exists and is cancellable
      const result = await client.query(
        `SELECT status 
         FROM download_queue 
         WHERE id = $1 
         AND status IN ('pending', 'downloading')`,
        [downloadId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Download ${downloadId} not found or not cancellable`);
      }

      // Remove from queue
      await client.query(
        'DELETE FROM download_queue WHERE id = $1',
        [downloadId]
      );

      // Record cancellation
      await client.query(
        `INSERT INTO vod_downloads (
          vod_id, download_status, started_at,
          completed_at, error_message
        ) VALUES (
          (SELECT vod_id FROM download_queue WHERE id = $1),
          'cancelled',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          'Download cancelled by user'
        )`,
        [downloadId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error cancelling download ${downloadId}:`, error);
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
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'downloading' THEN 1 ELSE 0 END) as downloading,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM download_queue
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
        "UPDATE download_queue SET status = 'pending' WHERE status = 'downloading'"
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

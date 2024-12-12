import { Pool } from 'pg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';
import { mediaServer } from '../media/server';
import { handleError, AppError } from '../../utils/error';

interface DownloadTask {
  id: number;
  vod_id: number;
  chapter_id: number | null;
  priority: number;
  status: string;
}

class VODDownloader {
  private pool: Pool;
  private tempDir: string;
  private maxConcurrent: number;
  private activeDownloads: Set<number>;
  private retryAttempts: number;
  private retryDelay: number;
  private static instance: VODDownloader;

  private constructor(pool: Pool, config: {
    tempDir: string;
    maxConcurrent: number;
    retryAttempts: number;
    retryDelay: number;
  }) {
    this.pool = pool;
    this.tempDir = config.tempDir;
    this.maxConcurrent = config.maxConcurrent;
    this.retryAttempts = config.retryAttempts;
    this.retryDelay = config.retryDelay;
    this.activeDownloads = new Set();

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public static getInstance(pool: Pool, config: {
    tempDir: string;
    maxConcurrent: number;
    retryAttempts: number;
    retryDelay: number;
  }): VODDownloader {
    if (!VODDownloader.instance) {
      VODDownloader.instance = new VODDownloader(pool, config);
    }
    return VODDownloader.instance;
  }

  private async handleDownloadError(error: unknown, vodId: number): Promise<void> {
    const appError = handleError(error);
    logger.error(`Error downloading VOD ${vodId}:`, appError);

    const client = await this.pool.connect();
    try {
      await client.query(
        'UPDATE vod_downloads SET error_message = $1, status = $2 WHERE vod_id = $3',
        [appError.message, 'failed', vodId]
      );
    } finally {
      client.release();
    }
  }

  async addToQueue(vodId: number, chapterId: number | null = null, priority: number = 1): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const vodExists = await client.query(
        'SELECT id FROM vods WHERE id = $1',
        [vodId]
      );

      if (vodExists.rows.length === 0) {
        throw new Error(`VOD ${vodId} not found`);
      }

      const queueCheck = await client.query(
        'SELECT id FROM download_queue WHERE vod_id = $1 AND (chapter_id = $2 OR ($2 IS NULL AND chapter_id IS NULL))',
        [vodId, chapterId]
      );

      if (queueCheck.rows.length === 0) {
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
      const vodResult = await client.query(
        'SELECT twitch_vod_id, url FROM vods WHERE id = $1',
        [task.vod_id]
      );

      if (vodResult.rows.length === 0) {
        throw new Error(`VOD ${task.vod_id} not found`);
      }

      const vod = vodResult.rows[0];
      const tempFilePath = path.join(this.tempDir, `${vod.twitch_vod_id}.mp4`);

      await client.query(
        'UPDATE download_queue SET status = $1 WHERE id = $2',
        ['downloading', task.id]
      );

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

      // Move file to media server
      const finalPath = await mediaServer(this.pool).organizeVOD(task.vod_id, tempFilePath);

      await client.query(
        `INSERT INTO vod_downloads (
          vod_id, download_path, download_status,
          started_at, completed_at, file_size
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4)`,
        [task.vod_id, finalPath, 'completed', fs.statSync(finalPath).size]
      );

      await client.query(
        'DELETE FROM download_queue WHERE id = $1',
        [task.id]
      );

      logger.info(`Successfully downloaded VOD ${task.vod_id}`);
    } catch (error) {
      logger.error(`Error downloading VOD ${task.vod_id}:`, error);

      await client.query(
        'UPDATE download_queue SET status = $1, error_message = $2 WHERE id = $3',
        ['failed', error.message, task.id]
      );

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

  async startProcessing(intervalSeconds: number = 30): Promise<void> {
    logger.info(`Starting download queue processing with ${intervalSeconds} second interval`);

    setInterval(() => {
      this.processQueue().catch(error => {
        logger.error('Error in download queue interval:', error);
      });
    }, intervalSeconds * 1000);

    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    try {
      const result = await this.pool.query<DownloadTask>(
        `SELECT * FROM download_queue 
         WHERE status = 'pending' 
         ORDER BY priority DESC, created_at ASC 
         LIMIT $1`,
        [this.maxConcurrent - this.activeDownloads.size]
      );

      for (const task of result.rows) {
        if (this.activeDownloads.size >= this.maxConcurrent) break;

        this.activeDownloads.add(task.id);
        this.processDownload(task).catch(error => {
          logger.error(`Error processing download task ${task.id}:`, error);
        });
      }
    } catch (error) {
      logger.error('Error processing download queue:', error);
    }
  }

  async getQueueStatus(): Promise<{ pending: number; downloading: number; failed: number; }> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'downloading' THEN 1 END) as downloading,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM download_queue
    `);

    return {
      pending: parseInt(result.rows[0].pending) || 0,
      downloading: parseInt(result.rows[0].downloading) || 0,
      failed: parseInt(result.rows[0].failed) || 0
    };
  }

  async cleanupTempFiles(maxAgeHours: number = 24): Promise<void> {
    try {
      const maxAge = maxAgeHours * 60 * 60 * 1000;
      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          logger.info(`Cleaned up temp file: ${file}`);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up temp files:', error);
      throw error;
    }
  }
}

export const vodDownloader = (pool: Pool, config: {
  tempDir: string;
  maxConcurrent: number;
  retryAttempts: number;
  retryDelay: number;
}) => VODDownloader.getInstance(pool, config);

export default vodDownloader;

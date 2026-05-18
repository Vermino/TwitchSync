import { Pool } from 'pg';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';
import { StorageSettings } from '../../types/settings';

export class StorageManager {
  private pool: Pool;
  private static instance: StorageManager;
  private isCleanupRunning: boolean = false;

  private constructor(pool: Pool) {
    this.pool = pool;
  }

  public static getInstance(pool: Pool): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager(pool);
    }
    return StorageManager.instance;
  }

  private async getStorageSettings(): Promise<StorageSettings> {
    const result = await this.pool.query(
      'SELECT value FROM settings WHERE key = \'storage\''
    );
    return result.rows[0].value as StorageSettings;
  }

  private async getDownloadPath(): Promise<string> {
    const result = await this.pool.query(
      'SELECT value->\'downloadPath\' as path FROM settings WHERE key = \'downloads\''
    );
    return result.rows[0].path || '.';
  }

  async getStorageStats(path: string) {
    try {
      const stats = await fs.statfs(path);
      return {
        total: stats.blocks * stats.bsize,
        free: stats.bfree * stats.bsize,
        available: stats.bavail * stats.bsize,
        used: (stats.blocks - stats.bfree) * stats.bsize
      };
    } catch (error) {
      logger.error('Error getting storage stats:', error);
      throw error;
    }
  }

  async shouldCleanup(): Promise<boolean> {
    try {
      const settings = await this.getStorageSettings();
      if (!settings.enableAutoCleanup) return false;

      const downloadPath = await this.getDownloadPath();
      const stats = await this.getStorageStats(downloadPath);

      const usedGB = stats.used / (1024 * 1024 * 1024);
      return usedGB >= settings.cleanupThresholdGB;
    } catch (error) {
      logger.error('Error checking cleanup condition:', error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    if (this.isCleanupRunning) {
      logger.info('Cleanup already in progress');
      return;
    }

    this.isCleanupRunning = true;
    const client = await this.pool.connect();

    try {
      const settings = await this.getStorageSettings();
      const downloadPath = await this.getDownloadPath();

      // Get all VOD files older than the minimum age
      const minAge = settings.minAgeForCleanupDays * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(Date.now() - minAge);

      const result = await client.query(
        `SELECT v.id, v.file_path, v.created_at, vd.metadata_path
         FROM vods v
         LEFT JOIN vod_downloads vd ON v.id = vd.vod_id
         WHERE v.created_at < $1
         ORDER BY v.created_at ASC`,
        [cutoffDate]
      );

      for (const vod of result.rows) {
        try {
          // Delete VOD file
          if (vod.file_path) {
            await fs.unlink(vod.file_path);
          }

          // Delete metadata file if configured
          if (!settings.keepMetadataOnCleanup && vod.metadata_path) {
            await fs.unlink(vod.metadata_path);
          }

          // Update database
          await client.query(
            'UPDATE vods SET file_path = NULL WHERE id = $1',
            [vod.id]
          );

          logger.info(`Cleaned up VOD ${vod.id}`);

          // Check if we've freed up enough space
          if (!await this.shouldCleanup()) {
            break;
          }
        } catch (error) {
          logger.error(`Error cleaning up VOD ${vod.id}:`, error);
          continue;
        }
      }
    } catch (error) {
      logger.error('Error during cleanup:', error);
      throw error;
    } finally {
      client.release();
      this.isCleanupRunning = false;
    }
  }

  async startMonitoring(checkIntervalMinutes: number = 30): Promise<void> {
    logger.info(`Starting storage monitoring with ${checkIntervalMinutes} minute interval`);

    setInterval(async () => {
      try {
        if (await this.shouldCleanup()) {
          await this.cleanup();
        }
      } catch (error) {
        logger.error('Error in storage monitoring interval:', error);
      }
    }, checkIntervalMinutes * 60 * 1000);

    // Initial check
    try {
      if (await this.shouldCleanup()) {
        await this.cleanup();
      }
    } catch (error) {
      logger.error('Error in initial storage check:', error);
    }
  }

  async checkStorageAlert(): Promise<boolean> {
    try {
      const settings = await this.getStorageSettings();
      const downloadPath = await this.getDownloadPath();
      const stats = await this.getStorageStats(downloadPath);

      const freePercentage = (stats.free / stats.total) * 100;
      return freePercentage <= settings.diskSpaceAlertThreshold;
    } catch (error) {
      logger.error('Error checking storage alert:', error);
      return false;
    }
  }
}

export const storageManager = (pool: Pool) => StorageManager.getInstance(pool);
export default storageManager;

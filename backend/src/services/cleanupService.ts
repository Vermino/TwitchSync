// Filepath: backend/src/services/cleanupService.ts

import { Pool } from 'pg';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { config } from '../config';
import path from 'path';

const execAsync = promisify(exec);

export interface CleanupStats {
  tempFiles: {
    scanned: number;
    deleted: number;
    spaceFreed: number; // bytes
  };
  logFiles: {
    scanned: number;
    deleted: number;
    spaceFreed: number;
  };
  database: {
    oldEvents: number;
    orphanedRecords: number;
  };
  lastCleanup: Date;
  duration: number; // milliseconds
}

export interface CleanupConfig {
  // File retention periods (in milliseconds)
  tempFileMaxAge: number;
  logFileMaxAge: number;
  downloadRetentionDays: number;

  // Database cleanup settings
  eventRetentionDays: number;

  // Disk space management
  diskSpaceThresholdGB: number;
  emergencyCleanupEnabled: boolean;

  // Cleanup intervals
  regularCleanupInterval: number;
  emergencyCleanupInterval: number;
}

export class CleanupService extends EventEmitter {
  private pool: Pool;
  private config: CleanupConfig;
  private isRunning: boolean = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private lastStats: CleanupStats | null = null;

  constructor(pool: Pool, cleanupConfig?: Partial<CleanupConfig>) {
    super();
    this.pool = pool;

    // Default cleanup configuration
    this.config = {
      tempFileMaxAge: 24 * 60 * 60 * 1000, // 24 hours
      logFileMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      downloadRetentionDays: 30,
      eventRetentionDays: 90,
      diskSpaceThresholdGB: 5,
      emergencyCleanupEnabled: true,
      regularCleanupInterval: 60 * 60 * 1000, // 1 hour
      emergencyCleanupInterval: 5 * 60 * 1000, // 5 minutes
      ...cleanupConfig
    };
  }

  /**
   * Start automatic cleanup service
   */
  public async startCleanupService(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Cleanup service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting cleanup service...');

    // Run initial cleanup
    await this.performCleanup();

    // Schedule regular cleanup
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        logger.error('Scheduled cleanup failed:', error);
      }
    }, this.config.regularCleanupInterval);

    // Set up disk space monitoring for emergency cleanup
    if (this.config.emergencyCleanupEnabled) {
      this.setupEmergencyCleanup();
    }

    logger.info(`Cleanup service started with ${this.config.regularCleanupInterval / 60000}min interval`);
    this.emit('cleanup:started');
  }

  /**
   * Stop cleanup service
   */
  public stopCleanupService(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isRunning = false;
    logger.info('Cleanup service stopped');
    this.emit('cleanup:stopped');
  }

  /**
   * Perform comprehensive cleanup
   */
  public async performCleanup(): Promise<CleanupStats> {
    const startTime = Date.now();
    logger.info('Starting cleanup process...');

    const stats: CleanupStats = {
      tempFiles: { scanned: 0, deleted: 0, spaceFreed: 0 },
      logFiles: { scanned: 0, deleted: 0, spaceFreed: 0 },
      database: { oldEvents: 0, orphanedRecords: 0 },
      lastCleanup: new Date(),
      duration: 0
    };

    try {
      // Run cleanup tasks in parallel
      const [tempFilesResult, logFilesResult, databaseResult] = await Promise.allSettled([
        this.cleanupTempFiles(),
        this.cleanupLogFiles(),
        this.cleanupDatabase(),
        this.cleanupAbandonedDownloads()
      ]);

      // Aggregate results
      if (tempFilesResult.status === 'fulfilled') {
        stats.tempFiles = tempFilesResult.value;
      } else {
        logger.error('Temp files cleanup failed:', tempFilesResult.reason);
      }

      if (logFilesResult.status === 'fulfilled') {
        stats.logFiles = logFilesResult.value;
      } else {
        logger.error('Log files cleanup failed:', logFilesResult.reason);
      }

      if (databaseResult.status === 'fulfilled') {
        stats.database = databaseResult.value;
      } else {
        logger.error('Database cleanup failed:', databaseResult.reason);
      }

      stats.duration = Date.now() - startTime;
      this.lastStats = stats;

      logger.info(`Cleanup completed in ${stats.duration}ms`, {
        tempFiles: `${stats.tempFiles.deleted}/${stats.tempFiles.scanned} deleted`,
        logFiles: `${stats.logFiles.deleted}/${stats.logFiles.scanned} deleted`,
        spaceFreed: `${Math.round((stats.tempFiles.spaceFreed + stats.logFiles.spaceFreed) / 1024 / 1024)}MB`,
        databaseEvents: stats.database.oldEvents,
        orphanedRecords: stats.database.orphanedRecords
      });

      this.emit('cleanup:completed', stats);
      return stats;
    } catch (error) {
      stats.duration = Date.now() - startTime;
      logger.error('Cleanup process failed:', error);
      this.emit('cleanup:error', error);
      throw error;
    }
  }

  /**
   * Clean up temporary files
   */
  private async cleanupTempFiles(): Promise<{ scanned: number; deleted: number; spaceFreed: number }> {
    const tempDir = config.storage.tempPath;
    const stats = { scanned: 0, deleted: 0, spaceFreed: 0 };

    try {
      // Ensure temp directory exists
      await fs.mkdir(tempDir, { recursive: true });

      const items = await fs.readdir(tempDir);
      stats.scanned = items.length;

      for (const item of items) {
        const itemPath = path.join(tempDir, item);

        try {
          const fileStat = await fs.stat(itemPath);
          const ageMs = Date.now() - fileStat.mtime.getTime();

          // Delete if older than threshold
          if (ageMs > this.config.tempFileMaxAge) {
            const sizeBefore = fileStat.size;

            if (fileStat.isDirectory()) {
              await this.removeDirectoryRecursive(itemPath);
            } else {
              await fs.unlink(itemPath);
            }

            stats.deleted++;
            stats.spaceFreed += sizeBefore;
            logger.debug(`Cleaned up temp item: ${item} (${sizeBefore} bytes)`);
          }
        } catch (error) {
          logger.debug(`Could not process temp item ${item}:`, error);
        }
      }

      return stats;
    } catch (error) {
      logger.error('Error cleaning up temp files:', error);
      return stats;
    }
  }

  /**
   * Clean up old log files
   */
  private async cleanupLogFiles(): Promise<{ scanned: number; deleted: number; spaceFreed: number }> {
    const stats = { scanned: 0, deleted: 0, spaceFreed: 0 };
    const logDirs = ['./logs', './temp/logs']; // Common log directories

    for (const logDir of logDirs) {
      try {
        const items = await fs.readdir(logDir);
        stats.scanned += items.length;

        for (const item of items) {
          if (!item.endsWith('.log') && !item.endsWith('.txt')) continue;

          const itemPath = path.join(logDir, item);

          try {
            const fileStat = await fs.stat(itemPath);
            const ageMs = Date.now() - fileStat.mtime.getTime();

            if (ageMs > this.config.logFileMaxAge) {
              const sizeBefore = fileStat.size;
              await fs.unlink(itemPath);

              stats.deleted++;
              stats.spaceFreed += sizeBefore;
              logger.debug(`Cleaned up log file: ${item} (${sizeBefore} bytes)`);
            }
          } catch (error) {
            logger.debug(`Could not process log file ${item}:`, error);
          }
        }
      } catch (error) {
        // Log directory might not exist, which is fine
        logger.debug(`Log directory ${logDir} not accessible:`, error);
      }
    }

    return stats;
  }

  /**
   * Clean up old database records
   */
  private async cleanupDatabase(): Promise<{ oldEvents: number; orphanedRecords: number }> {
    const client = await this.pool.connect();
    const stats = { oldEvents: 0, orphanedRecords: 0 };

    try {
      await client.query('BEGIN');

      // Clean up old task events
      const taskEventsResult = await client.query(`
        DELETE FROM task_events
        WHERE created_at < NOW() - INTERVAL '${this.config.eventRetentionDays} days'
        RETURNING id
      `);
      stats.oldEvents += taskEventsResult.rowCount || 0;

      // Clean up old VOD events
      const vodEventsResult = await client.query(`
        DELETE FROM vod_events
        WHERE created_at < NOW() - INTERVAL '${this.config.eventRetentionDays} days'
        RETURNING id
      `);
      stats.oldEvents += vodEventsResult.rowCount || 0;

      // Clean up orphaned monitoring records
      const orphanedMonitoringResult = await client.query(`
        DELETE FROM task_monitoring
        WHERE task_id NOT IN (SELECT id FROM tasks)
        RETURNING id
      `);
      stats.orphanedRecords += orphanedMonitoringResult.rowCount || 0;

      // Clean up very old completed VODs
      const oldVodsResult = await client.query(`
        UPDATE vods
        SET download_path = NULL, resume_segment_index = 0
        WHERE download_status = 'completed'
        AND downloaded_at < NOW() - INTERVAL '${this.config.downloadRetentionDays} days'
        AND download_path IS NOT NULL
        RETURNING id
      `);

      // Clean up old task history
      const taskHistoryResult = await client.query(`
        DELETE FROM task_history
        WHERE start_time < NOW() - INTERVAL '${this.config.eventRetentionDays} days'
        RETURNING id
      `);
      stats.orphanedRecords += taskHistoryResult.rowCount || 0;

      await client.query('COMMIT');

      logger.debug(`Database cleanup: ${stats.oldEvents} old events, ${stats.orphanedRecords} orphaned records`);
      return stats;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Database cleanup failed:', error);
      return stats;
    } finally {
      client.release();
    }
  }

  /**
   * Clean up abandoned downloads
   */
  private async cleanupAbandonedDownloads(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Find downloads that have been stuck for a long time
      // Exclude VODs that actually completed (have entries in completed_vods)
      const abandonedResult = await client.query(`
        SELECT v.id, v.download_path, cv.vod_id IS NOT NULL as is_completed
        FROM vods v
        LEFT JOIN completed_vods cv ON v.id = cv.vod_id
        WHERE v.download_status IN ('downloading', 'processing')
        AND v.updated_at < NOW() - INTERVAL '6 hours'
      `);

      for (const vod of abandonedResult.rows) {
        try {
          if (vod.is_completed) {
            // This VOD actually completed — fix its status instead of marking failed
            await client.query(`
              UPDATE vods
              SET download_status = 'completed',
                  download_progress = 100,
                  updated_at = NOW()
              WHERE id = $1
            `, [vod.id]);
            logger.info(`Fixed completed download mistakenly stuck in downloading: VOD ${vod.id}`);
          } else {
            // Truly abandoned — clean up temp files and mark as failed
            if (vod.download_path) {
              const tempPath = path.join(config.storage.tempPath, path.basename(vod.download_path));
              await this.removeDirectoryRecursive(tempPath);
            }

            await client.query(`
              UPDATE vods
              SET download_status = 'failed',
                  error_message = 'Download abandoned during cleanup',
                  download_path = NULL,
                  download_progress = 0,
                  resume_segment_index = 0,
                  updated_at = NOW()
              WHERE id = $1
            `, [vod.id]);
            logger.info(`Cleaned up abandoned download: VOD ${vod.id}`);
          }
        } catch (error) {
          logger.error(`Failed to cleanup abandoned download ${vod.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up abandoned downloads:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Set up emergency cleanup when disk space is low
   */
  private setupEmergencyCleanup(): void {
    setInterval(async () => {
      try {
        const freeSpace = await this.getAvailableDiskSpace();
        const freeSpaceGB = freeSpace / (1024 * 1024 * 1024);

        if (freeSpaceGB < this.config.diskSpaceThresholdGB) {
          logger.warn(`Low disk space detected: ${freeSpaceGB.toFixed(2)}GB free`);
          await this.performEmergencyCleanup();
        }
      } catch (error) {
        logger.error('Emergency cleanup check failed:', error);
      }
    }, this.config.emergencyCleanupInterval);
  }

  /**
   * Perform emergency cleanup when disk space is critically low
   */
  private async performEmergencyCleanup(): Promise<void> {
    logger.warn('Performing emergency cleanup due to low disk space...');

    const client = await this.pool.connect();

    try {
      // More aggressive temp file cleanup (reduce age threshold)
      const originalTempAge = this.config.tempFileMaxAge;
      this.config.tempFileMaxAge = 60 * 60 * 1000; // 1 hour instead of 24

      await this.cleanupTempFiles();

      // Restore original threshold
      this.config.tempFileMaxAge = originalTempAge;

      // Clean up failed downloads
      await client.query(`
        UPDATE vods
        SET download_path = NULL, resume_segment_index = 0
        WHERE download_status = 'failed'
        AND updated_at < NOW() - INTERVAL '24 hours'
      `);

      // Clean up cancelled downloads
      await client.query(`
        UPDATE vods
        SET download_path = NULL, resume_segment_index = 0
        WHERE download_status = 'cancelled'
        AND updated_at < NOW() - INTERVAL '1 hour'
      `);

      logger.info('Emergency cleanup completed');
      this.emit('cleanup:emergency', { timestamp: new Date() });
    } catch (error) {
      logger.error('Emergency cleanup failed:', error);
      this.emit('cleanup:emergency:error', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get available disk space for storage directory
   */
  private async getAvailableDiskSpace(): Promise<number> {
    try {
      if (fs.statfs) {
        const stats = await fs.statfs(config.storage.storagePath) as any;
        return (stats.bavail || 0) * (stats.bsize || 1);
      } else {
        const fallback = await this.getFallbackDiskSpace(config.storage.storagePath);
        return fallback.free;
      }
    } catch (error) {
      logger.debug('Could not get disk space, using fallback:', error);
      const fallback = await this.getFallbackDiskSpace(config.storage.storagePath);
      return fallback.free;
    }
  }

  /**
   * Fallback disk space calculation using wmic on Windows
   */
  private async getFallbackDiskSpace(checkPath: string): Promise<{ total: number; free: number }> {
    try {
      if (process.platform === 'win32') {
        const driveLetter = path.resolve(checkPath).split(':')[0] + ':';
        const { stdout } = await execAsync(
          `wmic logicaldisk where "DeviceID='${driveLetter}'" get Size,FreeSpace /Format:csv`
        );
        const lines = stdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('Node'));
        if (lines.length > 0) {
          const parts = lines[0].trim().split(',');
          if (parts.length >= 3) {
            const free = parseInt(parts[1], 10);
            const total = parseInt(parts[2], 10);
            if (!isNaN(total) && !isNaN(free)) {
              return { total, free };
            }
          }
        }
      }
      logger.warn('Could not determine real disk space via fallback');
      return { total: 0, free: 0 };
    } catch (error) {
      logger.debug('Fallback disk space check failed:', error);
      return { total: 0, free: 0 };
    }
  }

  /**
   * Recursively remove directory and all contents
   */
  private async removeDirectoryRecursive(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      logger.debug(`Could not remove directory ${dirPath}:`, error);
    }
  }

  /**
   * Get last cleanup statistics
   */
  public getLastCleanupStats(): CleanupStats | null {
    return this.lastStats;
  }

  /**
   * Force cleanup now
   */
  public async forceCleanup(): Promise<CleanupStats> {
    logger.info('Manual cleanup triggered');
    return this.performCleanup();
  }
}

export const createCleanupService = (pool: Pool, config?: Partial<CleanupConfig>) =>
  new CleanupService(pool, config);
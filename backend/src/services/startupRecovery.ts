// Filepath: backend/src/services/startupRecovery.ts

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { promises as fs } from 'fs';
import path from 'path';
import { config } from '../config';

interface RecoveryTask {
  id: number;
  status: string;
  updated_at: Date;
  last_run: Date;
}

interface RecoveryVod {
  id: number;
  download_status: string;
  download_path?: string; // Use download_path instead of file_path
  resume_segment_index?: number; // Use actual column name
  download_progress?: number; // Use actual column name
  updated_at: Date;
}

export class StartupRecoveryService {
  private pool: Pool;
  private tempDir: string;
  private maxRecoveryAge: number = 24 * 60 * 60 * 1000; // 24 hours in ms

  constructor(pool: Pool, tempDir?: string) {
    this.pool = pool;
    this.tempDir = tempDir || config.storage.tempPath;
  }

  /**
   * Main recovery method called on server startup
   */
  public async performStartupRecovery(): Promise<void> {
    logger.info('Starting startup recovery process...');

    try {
      // Run all recovery tasks in parallel
      await Promise.all([
        this.recoverInterruptedTasks(),
        this.recoverIncompleteDownloads(),
        this.cleanupOrphanedTempFiles(),
        this.validateDatabaseConsistency()
      ]);

      logger.info('Startup recovery completed successfully');
    } catch (error) {
      logger.error('Startup recovery failed:', error);
      throw error;
    }
  }

  /**
   * Recover tasks that were running when server shut down
   */
  private async recoverInterruptedTasks(): Promise<void> {
    logger.info('Recovering interrupted tasks...');

    const client = await this.pool.connect();
    try {
      // Find tasks that were marked as running but should be recovered
      const taskResult = await client.query<RecoveryTask>(`
        SELECT id, status, updated_at, last_run
        FROM tasks
        WHERE status = 'running'
        AND (
          updated_at < NOW() - INTERVAL '30 minutes'
          OR last_run IS NULL
        )
        AND is_active = true
      `);

      const interruptedTasks = taskResult.rows;
      logger.info(`Found ${interruptedTasks.length} interrupted tasks to recover`);

      for (const task of interruptedTasks) {
        await this.recoverTask(client, task);
      }

      logger.info('Task recovery completed');
    } catch (error) {
      logger.error('Error recovering interrupted tasks:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Recover a specific interrupted task
   */
  private async recoverTask(client: any, task: RecoveryTask): Promise<void> {
    try {
      await client.query('BEGIN');

      // Reset task status to pending for re-execution
      await client.query(`
        UPDATE tasks
        SET status = 'pending',
            error_message = 'Recovered from server restart',
            updated_at = NOW()
        WHERE id = $1
      `, [task.id]);

      // Update task monitoring
      await client.query(`
        UPDATE task_monitoring
        SET status = 'pending',
            status_message = 'Task recovered from server restart',
            updated_at = NOW()
        WHERE task_id = $1
      `, [task.id]);

      // Create recovery event
      await client.query(`
        INSERT INTO task_events (task_id, event_type, details, created_at)
        VALUES ($1, 'recovery', $2, NOW())
      `, [task.id, JSON.stringify({
        reason: 'server_restart',
        previous_status: task.status,
        recovery_time: new Date().toISOString()
      })]);

      await client.query('COMMIT');
      logger.info(`Recovered task ${task.id} from interrupted state`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Failed to recover task ${task.id}:`, error);
    }
  }

  /**
   * Recover incomplete downloads and resume them
   */
  private async recoverIncompleteDownloads(): Promise<void> {
    logger.info('Recovering incomplete downloads...');

    const client = await this.pool.connect();
    try {
      // Find downloads that were in progress when server shut down
      const vodResult = await client.query<RecoveryVod>(`
        SELECT id, download_status, download_path, resume_segment_index, download_progress, updated_at
        FROM vods
        WHERE download_status IN ('downloading', 'processing')
        AND updated_at > NOW() - INTERVAL '24 hours'
        ORDER BY updated_at DESC
      `);

      const incompleteDownloads = vodResult.rows;
      logger.info(`Found ${incompleteDownloads.length} incomplete downloads to recover`);

      for (const vod of incompleteDownloads) {
        await this.recoverDownload(client, vod);
      }

      logger.info('Download recovery completed');
    } catch (error) {
      logger.error('Error recovering incomplete downloads:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Recover a specific incomplete download
   */
  private async recoverDownload(client: any, vod: RecoveryVod): Promise<void> {
    try {
      await client.query('BEGIN');

      // Check if temp files exist and are valid
      const canResume = await this.validateDownloadResumption(vod);

      if (canResume) {
        // Mark for resumption with existing progress
        await client.query(`
          UPDATE vods
          SET download_status = 'queued',
              error_message = 'Queued for resume after server restart',
              updated_at = NOW()
          WHERE id = $1
        `, [vod.id]);

        logger.info(`Download ${vod.id} queued for resumption at ${vod.download_progress || 0}%`);
      } else {
        // Reset download completely
        await client.query(`
          UPDATE vods
          SET download_status = 'queued',
              download_progress = 0,
              download_path = NULL,
              resume_segment_index = 0,
              error_message = 'Reset for fresh download after server restart',
              updated_at = NOW()
          WHERE id = $1
        `, [vod.id]);

        logger.info(`Download ${vod.id} reset for fresh start`);
      }

      // Create recovery event
      await client.query(`
        INSERT INTO vod_events (vod_id, event_type, details, created_at)
        VALUES ($1, 'recovery', $2, NOW())
      `, [vod.id, JSON.stringify({
        reason: 'server_restart',
        previous_status: vod.download_status,
        can_resume: canResume,
        previous_progress: vod.download_progress || 0,
        recovery_time: new Date().toISOString()
      })]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Failed to recover download ${vod.id}:`, error);
    }
  }

  /**
   * Validate if a download can be resumed from where it left off
   */
  private async validateDownloadResumption(vod: RecoveryVod): Promise<boolean> {
    if (!vod.download_path) return false;

    try {
      // Check if download directory exists
      const downloadPath = path.join(this.tempDir, path.basename(vod.download_path));
      const stats = await fs.stat(downloadPath);
      
      // Verify temp files are not too old (older than 24 hours indicates stale)
      const ageMs = Date.now() - stats.mtime.getTime();
      if (ageMs > this.maxRecoveryAge) {
        return false;
      }

      // Check if segment files exist
      const files = await fs.readdir(downloadPath);
      const segmentFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.m4s'));
      
      // If we have segment files and reasonable progress, we can resume
      return segmentFiles.length > 0 && (vod.download_progress || 0) > 5;
    } catch (error) {
      logger.debug(`Cannot validate resumption for VOD ${vod.id}:`, error);
      return false;
    }
  }

  /**
   * Clean up orphaned temporary files from previous sessions
   */
  private async cleanupOrphanedTempFiles(): Promise<void> {
    logger.info('Cleaning up orphaned temporary files...');

    try {
      // Ensure temp directory exists
      await fs.mkdir(this.tempDir, { recursive: true });

      const tempDirContents = await fs.readdir(this.tempDir);
      let cleanedCount = 0;

      for (const item of tempDirContents) {
        const itemPath = path.join(this.tempDir, item);
        
        try {
          const stats = await fs.stat(itemPath);
          const ageMs = Date.now() - stats.mtime.getTime();

          // Remove directories/files older than 24 hours
          if (ageMs > this.maxRecoveryAge) {
            if (stats.isDirectory()) {
              await fs.rm(itemPath, { recursive: true, force: true });
            } else {
              await fs.unlink(itemPath);
            }
            cleanedCount++;
          }
        } catch (error) {
          logger.debug(`Could not process temp item ${item}:`, error);
        }
      }

      logger.info(`Cleaned up ${cleanedCount} orphaned temp items`);
    } catch (error) {
      logger.error('Error cleaning up temp files:', error);
      // Don't throw here - cleanup failure shouldn't prevent startup
    }
  }

  /**
   * Validate database consistency and fix common issues
   */
  private async validateDatabaseConsistency(): Promise<void> {
    logger.info('Validating database consistency...');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // IMPORTANT: DO NOT DELETE CHANNELS - they should persist permanently
      // Channels are user data and should only be deleted explicitly by user action
      
      // Log channel count for monitoring
      const channelCount = await client.query('SELECT COUNT(*) as count FROM channels WHERE is_active = true');
      logger.info(`Database consistency check: Found ${channelCount.rows[0].count} active channels`);

      // Fix VODs with inconsistent download states
      await client.query(`
        UPDATE vods 
        SET download_status = 'failed',
            error_message = 'Inconsistent state fixed during startup recovery'
        WHERE download_status = 'downloading'
        AND download_progress = 0
        AND updated_at < NOW() - INTERVAL '1 hour'
      `);

      // Reset stuck task monitoring entries
      await client.query(`
        UPDATE task_monitoring
        SET status = 'pending',
            status_message = 'Reset stuck monitoring entry during startup'
        WHERE status = 'running'
        AND updated_at < NOW() - INTERVAL '1 hour'
      `);

      // Clean up orphaned monitoring entries (but preserve channel references)
      await client.query(`
        DELETE FROM task_monitoring
        WHERE task_id NOT IN (SELECT id FROM tasks)
      `);

      // Fix tasks with invalid next_run times
      await client.query(`
        UPDATE tasks
        SET next_run = NOW() + INTERVAL '1 minute'
        WHERE is_active = true
        AND schedule_type = 'interval'
        AND (next_run IS NULL OR next_run < NOW() - INTERVAL '1 day')
      `);

      // Validate that channels referenced in tasks still exist
      const orphanedTasksResult = await client.query(`
        SELECT t.id, t.name, t.channel_ids
        FROM tasks t
        WHERE t.is_active = true
        AND EXISTS (
          SELECT 1 FROM unnest(t.channel_ids) AS cid
          WHERE cid NOT IN (SELECT id FROM channels WHERE is_active = true)
        )
      `);
      
      if (orphanedTasksResult.rows.length > 0) {
        logger.warn(`Found ${orphanedTasksResult.rows.length} tasks referencing non-existent channels`);
        for (const task of orphanedTasksResult.rows) {
          logger.warn(`Task ${task.id} (${task.name}) references missing channel IDs: ${task.channel_ids}`);
        }
      }

      await client.query('COMMIT');
      logger.info('Database consistency validation completed');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error validating database consistency:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get recovery statistics for monitoring
   */
  public async getRecoveryStats(): Promise<{
    recoveredTasks: number;
    recoveredDownloads: number;
    cleanedFiles: number;
    lastRecoveryTime: Date;
  }> {
    // This would typically be stored during recovery
    // For now, return placeholder values
    return {
      recoveredTasks: 0,
      recoveredDownloads: 0,
      cleanedFiles: 0,
      lastRecoveryTime: new Date()
    };
  }
}

export const createStartupRecoveryService = (pool: Pool, tempDir?: string) =>
  new StartupRecoveryService(pool, tempDir);
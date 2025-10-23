// Filepath: backend/src/services/concurrentTaskManager.ts

import { Pool, PoolClient } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface LockOptions {
  timeoutMinutes: number;
  workerId: string;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface TaskDeletionOptions {
  cleanupOrphanedRecords: boolean;
  forceDelete: boolean;
  gracePeriodMinutes: number;
}

export interface ProcessingLock {
  vodId: number;
  taskId: number;
  twitchVodId: string;
  workerId: string;
  lockedAt: Date;
  expiresAt: Date;
  isExpired: boolean;
}

export interface ConcurrencyStats {
  activeLocks: number;
  expiredLocks: number;
  totalProcessingQueue: number;
  failedRetries: number;
  successfulCompletions: number;
  averageLockDuration: number;
  lastCleanupRun: Date;
}

export interface TaskDeletionResult {
  taskId: number;
  vodsDeleted: number;
  orphanedRecordsCleanup: {
    vodFileStates: number;
    completedVods: number;
    retentionTracking: number;
    taskMonitoring: number;
    taskEvents: number;
    taskHistory: number;
    taskSkippedVods: number;
  };
  errors: Array<{ table: string; error: string }>;
  executionTime: number;
}

export interface QueuedVOD {
  vodId: number;
  taskId: number;
  twitchVodId: string;
  operationStatus: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  priority: number;
}

export class ConcurrentTaskManager extends EventEmitter {
  private pool: Pool;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private lockCleanupRunning: boolean = false;

  constructor(pool: Pool) {
    super();
    this.pool = pool;
    this.startLockCleanupScheduler();
  }

  /**
   * Safely delete a task with comprehensive cleanup of related records
   */
  async safeDeleteTask(
    taskId: number, 
    userId: number,
    options: Partial<TaskDeletionOptions> = {}
  ): Promise<TaskDeletionResult> {
    const opts: TaskDeletionOptions = {
      cleanupOrphanedRecords: true,
      forceDelete: false,
      gracePeriodMinutes: 5,
      ...options
    };

    const client = await this.pool.connect();
    const startTime = Date.now();
    
    try {
      await client.query('BEGIN');
      logger.info(`Starting safe task deletion: ${taskId} for user ${userId}`, opts);

      // Verify task ownership
      const taskOwnership = await client.query(`
        SELECT id, user_id, name, is_active, status 
        FROM tasks 
        WHERE id = $1 AND user_id = $2
      `, [taskId, userId]);

      if (taskOwnership.rows.length === 0) {
        throw new Error(`Task ${taskId} not found or not owned by user ${userId}`);
      }

      const task = taskOwnership.rows[0];
      logger.info(`Deleting task: ${task.name} (status: ${task.status})`);

      // Check for active processing if not forced
      if (!opts.forceDelete) {
        const activeLocks = await client.query(`
          SELECT COUNT(*) as count
          FROM vod_file_states
          WHERE task_id = $1 
            AND processing_locked_by IS NOT NULL
            AND lock_timeout_at > NOW()
        `, [taskId]);

        if (parseInt(activeLocks.rows[0].count) > 0) {
          throw new Error(`Task ${taskId} has active processing locks. Use forceDelete option to override.`);
        }
      }

      // Release any active locks for this task
      await this.releaseTaskLocks(taskId, client);

      // Delete related records in proper dependency order
      const deletionResult: TaskDeletionResult = {
        taskId,
        vodsDeleted: 0,
        orphanedRecordsCleanup: {
          vodFileStates: 0,
          completedVods: 0,
          retentionTracking: 0,
          taskMonitoring: 0,
          taskEvents: 0,
          taskHistory: 0,
          taskSkippedVods: 0
        },
        errors: [],
        executionTime: 0
      };

      // 1. Delete file verification history (references vod_file_states)
      try {
        const fileVerificationResult = await client.query(`
          DELETE FROM file_verification_history
          WHERE file_state_id IN (
            SELECT vfs.id 
            FROM vod_file_states vfs 
            WHERE vfs.task_id = $1
          )
        `, [taskId]);
        logger.debug(`Deleted ${fileVerificationResult.rowCount} file verification history records`);
      } catch (error) {
        const errorMsg = `Failed to delete file verification history: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        deletionResult.errors.push({ table: 'file_verification_history', error: errorMsg });
      }

      // 2. Delete retention tracking (references vods)
      try {
        const retentionResult = await client.query(`
          DELETE FROM vod_retention_tracking
          WHERE vod_id IN (
            SELECT v.id 
            FROM vods v 
            WHERE v.task_id = $1
          )
        `, [taskId]);
        deletionResult.orphanedRecordsCleanup.retentionTracking = retentionResult.rowCount || 0;
        logger.debug(`Deleted ${retentionResult.rowCount} retention tracking records`);
      } catch (error) {
        const errorMsg = `Failed to delete retention tracking: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        deletionResult.errors.push({ table: 'vod_retention_tracking', error: errorMsg });
      }

      // 3. Delete VOD file states (references vods)
      try {
        const fileStatesResult = await client.query(`
          DELETE FROM vod_file_states
          WHERE task_id = $1
        `, [taskId]);
        deletionResult.orphanedRecordsCleanup.vodFileStates = fileStatesResult.rowCount || 0;
        logger.debug(`Deleted ${fileStatesResult.rowCount} VOD file states`);
      } catch (error) {
        const errorMsg = `Failed to delete VOD file states: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        deletionResult.errors.push({ table: 'vod_file_states', error: errorMsg });
      }

      // 4. Delete completed VODs (references vods and tasks)
      try {
        const completedVodsResult = await client.query(`
          DELETE FROM completed_vods
          WHERE task_id = $1
        `, [taskId]);
        deletionResult.orphanedRecordsCleanup.completedVods = completedVodsResult.rowCount || 0;
        logger.debug(`Deleted ${completedVodsResult.rowCount} completed VOD records`);
      } catch (error) {
        const errorMsg = `Failed to delete completed VODs: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        deletionResult.errors.push({ table: 'completed_vods', error: errorMsg });
      }

      // 5. Delete task skipped VODs
      try {
        const skippedVodsResult = await client.query(`
          DELETE FROM task_skipped_vods
          WHERE task_id = $1
        `, [taskId]);
        deletionResult.orphanedRecordsCleanup.taskSkippedVods = skippedVodsResult.rowCount || 0;
        logger.debug(`Deleted ${skippedVodsResult.rowCount} task skipped VODs`);
      } catch (error) {
        const errorMsg = `Failed to delete task skipped VODs: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        deletionResult.errors.push({ table: 'task_skipped_vods', error: errorMsg });
      }

      // 6. Delete VODs (main table)
      try {
        const vodsResult = await client.query(`
          DELETE FROM vods
          WHERE task_id = $1
        `, [taskId]);
        deletionResult.vodsDeleted = vodsResult.rowCount || 0;
        logger.debug(`Deleted ${vodsResult.rowCount} VODs`);
      } catch (error) {
        const errorMsg = `Failed to delete VODs: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        deletionResult.errors.push({ table: 'vods', error: errorMsg });
      }

      // 7. Delete task monitoring
      try {
        const monitoringResult = await client.query(`
          DELETE FROM task_monitoring
          WHERE task_id = $1
        `, [taskId]);
        deletionResult.orphanedRecordsCleanup.taskMonitoring = monitoringResult.rowCount || 0;
        logger.debug(`Deleted ${monitoringResult.rowCount} task monitoring records`);
      } catch (error) {
        const errorMsg = `Failed to delete task monitoring: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        deletionResult.errors.push({ table: 'task_monitoring', error: errorMsg });
      }

      // 8. Delete task events
      try {
        const eventsResult = await client.query(`
          DELETE FROM task_events
          WHERE task_id = $1
        `, [taskId]);
        deletionResult.orphanedRecordsCleanup.taskEvents = eventsResult.rowCount || 0;
        logger.debug(`Deleted ${eventsResult.rowCount} task events`);
      } catch (error) {
        const errorMsg = `Failed to delete task events: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        deletionResult.errors.push({ table: 'task_events', error: errorMsg });
      }

      // 9. Delete task history
      try {
        const historyResult = await client.query(`
          DELETE FROM task_history
          WHERE task_id = $1
        `, [taskId]);
        deletionResult.orphanedRecordsCleanup.taskHistory = historyResult.rowCount || 0;
        logger.debug(`Deleted ${historyResult.rowCount} task history records`);
      } catch (error) {
        const errorMsg = `Failed to delete task history: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        deletionResult.errors.push({ table: 'task_history', error: errorMsg });
      }

      // 10. Delete the task itself (final step)
      try {
        const taskResult = await client.query(`
          DELETE FROM tasks
          WHERE id = $1 AND user_id = $2
        `, [taskId, userId]);

        if (taskResult.rowCount === 0) {
          throw new Error(`Task ${taskId} could not be deleted - may have been deleted by another process`);
        }
        
        logger.debug(`Deleted task ${taskId}`);
      } catch (error) {
        const errorMsg = `Failed to delete task: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        deletionResult.errors.push({ table: 'tasks', error: errorMsg });
        throw error; // This is critical - rollback transaction
      }

      // 11. Clean up orphaned records if requested
      if (opts.cleanupOrphanedRecords) {
        const orphanedCleanup = await this.cleanupOrphanedRecords(client);
        // Add to existing counts
        deletionResult.orphanedRecordsCleanup.vodFileStates += orphanedCleanup.cleaned_vod_states;
        deletionResult.orphanedRecordsCleanup.completedVods += orphanedCleanup.cleaned_completed_vods;
        deletionResult.orphanedRecordsCleanup.retentionTracking += orphanedCleanup.cleaned_retention_tracking;
      }

      deletionResult.executionTime = Date.now() - startTime;

      await client.query('COMMIT');

      logger.info(`Task ${taskId} deleted successfully`, {
        vodsDeleted: deletionResult.vodsDeleted,
        totalOrphanedCleaned: Object.values(deletionResult.orphanedRecordsCleanup).reduce((a, b) => a + b, 0),
        errors: deletionResult.errors.length,
        executionTimeMs: deletionResult.executionTime
      });

      this.emit('task:deleted', { taskId, userId, result: deletionResult });

      return deletionResult;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Safe task deletion failed for task ${taskId}:`, error);
      this.emit('task:deletion_error', { taskId, userId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Acquire advisory lock for VOD processing with proper concurrency handling
   */
  async acquireVodLock(
    twitchVodId: string,
    taskId: number,
    options: Partial<LockOptions> = {}
  ): Promise<{ success: boolean; lockId?: string; reason?: string }> {
    const opts: LockOptions = {
      timeoutMinutes: 30,
      workerId: `worker_${process.pid}_${Date.now()}`,
      retryAttempts: 3,
      retryDelayMs: 1000,
      ...options
    };

    const client = await this.pool.connect();
    
    try {
      // Convert string to BIGINT for proper type handling
      const twitchVodIdBigInt = BigInt(twitchVodId);

      for (let attempt = 0; attempt < opts.retryAttempts; attempt++) {
        try {
          // Use database function for safe lock acquisition
          const lockResult = await client.query(`
            SELECT safe_queue_vod_for_processing($1, $2, $3, $4, $5, $6) as success
          `, [
            null, // vod_id - will be set by function if needed
            taskId,
            twitchVodIdBigInt,
            opts.workerId,
            null, // expected_size_bytes
            opts.timeoutMinutes
          ]);

          const success = lockResult.rows[0]?.success;

          if (success) {
            logger.debug(`Acquired VOD lock: ${twitchVodId} for task ${taskId} by ${opts.workerId}`);
            this.emit('lock:acquired', { twitchVodId, taskId, workerId: opts.workerId });
            
            return {
              success: true,
              lockId: `${twitchVodId}_${taskId}_${opts.workerId}`,
              reason: 'Lock acquired successfully'
            };
          }

          // Check why lock acquisition failed
          const existingLock = await client.query(`
            SELECT processing_locked_by, lock_timeout_at, operation_status
            FROM vod_file_states
            WHERE twitch_vod_id = $1 AND task_id = $2
          `, [twitchVodIdBigInt, taskId]);

          let reason = 'Lock acquisition failed';
          if (existingLock.rows.length > 0) {
            const lock = existingLock.rows[0];
            reason = `VOD locked by ${lock.processing_locked_by} until ${lock.lock_timeout_at}`;
          }

          if (attempt < opts.retryAttempts - 1) {
            logger.debug(`Lock acquisition attempt ${attempt + 1} failed: ${reason}. Retrying in ${opts.retryDelayMs}ms`);
            await this.delay(opts.retryDelayMs * (attempt + 1)); // Exponential backoff
            continue;
          }

          logger.warn(`Failed to acquire VOD lock after ${opts.retryAttempts} attempts: ${reason}`);
          return { success: false, reason };

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.error(`Lock acquisition attempt ${attempt + 1} error:`, error);
          
          if (attempt === opts.retryAttempts - 1) {
            return { success: false, reason: `Lock acquisition error: ${errorMsg}` };
          }
          
          await this.delay(opts.retryDelayMs * (attempt + 1));
        }
      }

      return { success: false, reason: 'All retry attempts exhausted' };

    } finally {
      client.release();
    }
  }

  /**
   * Release VOD processing lock with status update
   */
  async releaseVodLock(
    twitchVodId: string,
    taskId: number,
    workerId: string,
    result: {
      status: 'completed' | 'failed' | 'cancelled';
      filePath?: string;
      fileSize?: number;
      error?: string;
    }
  ): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      const twitchVodIdBigInt = BigInt(twitchVodId);
      
      // Map status to database enums
      const operationStatus = result.status === 'completed' ? 'completed' : 
                             result.status === 'failed' ? 'failed' : 'cancelled';
      
      const fileState = result.status === 'completed' ? 'present' :
                       result.status === 'failed' ? 'missing' : null;

      const errorDetails = result.error ? JSON.stringify({ error: result.error, timestamp: new Date() }) : null;

      // Use database function for safe lock release
      const releaseResult = await client.query(`
        SELECT safe_release_vod_lock($1, $2, $3, $4, $5, $6, $7, $8) as success
      `, [
        twitchVodIdBigInt,
        taskId,
        workerId,
        operationStatus,
        fileState,
        result.filePath,
        result.fileSize,
        errorDetails
      ]);

      const success = releaseResult.rows[0]?.success;

      if (success) {
        logger.debug(`Released VOD lock: ${twitchVodId} for task ${taskId} by ${workerId} (${result.status})`);
        this.emit('lock:released', { twitchVodId, taskId, workerId, result });
      } else {
        logger.warn(`Failed to release VOD lock: ${twitchVodId} for task ${taskId} by ${workerId}`);
      }

      return success;

    } catch (error) {
      logger.error(`Error releasing VOD lock ${twitchVodId} for task ${taskId}:`, error);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Get processing queue with proper ordering and filtering
   */
  async getProcessingQueue(limit: number = 100): Promise<QueuedVOD[]> {
    const client = await this.pool.connect();
    
    try {
      // Use database function for queue retrieval
      const queueResult = await client.query(`
        SELECT * FROM get_vod_processing_queue($1)
      `, [limit]);

      const queue: QueuedVOD[] = queueResult.rows.map(row => ({
        vodId: row.vod_id,
        taskId: row.task_id,
        twitchVodId: row.twitch_vod_id.toString(),
        operationStatus: row.operation_status,
        retryCount: row.retry_count,
        maxRetries: row.max_retries,
        createdAt: new Date(row.created_at),
        priority: this.calculatePriority(row.operation_status, row.retry_count)
      }));

      logger.debug(`Retrieved processing queue: ${queue.length} VODs`);
      return queue;

    } finally {
      client.release();
    }
  }

  /**
   * Clean up expired locks and reset stuck operations
   */
  async cleanupExpiredLocks(): Promise<{ cleaned: number; reset: number }> {
    if (this.lockCleanupRunning) {
      logger.debug('Lock cleanup already running, skipping');
      return { cleaned: 0, reset: 0 };
    }

    this.lockCleanupRunning = true;
    const client = await this.pool.connect();
    
    try {
      logger.debug('Starting expired lock cleanup');

      // Use database function for safe cleanup
      const cleanupResult = await client.query(`
        SELECT cleanup_expired_vod_locks() as cleaned_count
      `);

      const cleaned = cleanupResult.rows[0]?.cleaned_count || 0;

      // Also clean up any orphaned records while we're here
      const orphanedResult = await this.cleanupOrphanedRecords(client);

      logger.debug(`Lock cleanup completed: ${cleaned} locks cleaned, ${orphanedResult.cleaned_vod_states + orphanedResult.cleaned_completed_vods + orphanedResult.cleaned_retention_tracking} orphaned records`);

      this.emit('locks:cleanup_completed', { 
        cleaned, 
        orphanedCleanup: orphanedResult 
      });

      return { cleaned, reset: 0 };

    } catch (error) {
      logger.error('Lock cleanup failed:', error);
      throw error;
    } finally {
      this.lockCleanupRunning = false;
      client.release();
    }
  }

  /**
   * Get comprehensive concurrency statistics
   */
  async getConcurrencyStats(): Promise<ConcurrencyStats> {
    const client = await this.pool.connect();
    
    try {
      // Get active locks
      const activeLocksResult = await client.query(`
        SELECT COUNT(*) as count
        FROM vod_file_states
        WHERE processing_locked_by IS NOT NULL
          AND lock_timeout_at > NOW()
      `);

      // Get expired locks
      const expiredLocksResult = await client.query(`
        SELECT COUNT(*) as count
        FROM vod_file_states
        WHERE processing_locked_by IS NOT NULL
          AND lock_timeout_at < NOW()
      `);

      // Get processing queue size
      const queueResult = await client.query(`
        SELECT COUNT(*) as count
        FROM vod_file_states
        WHERE operation_status IN ('pending', 'failed')
          AND retry_count < max_retries
          AND processing_locked_by IS NULL
      `);

      // Get retry statistics
      const retryStats = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE retry_count >= max_retries) as failed_retries,
          COUNT(*) FILTER (WHERE operation_status = 'completed') as successful_completions,
          AVG(EXTRACT(EPOCH FROM (COALESCE(updated_at, created_at) - processing_started_at)) * 1000) as avg_duration
        FROM vod_file_states
        WHERE processing_started_at IS NOT NULL
          AND created_at > NOW() - INTERVAL '24 hours'
      `);

      const stats: ConcurrencyStats = {
        activeLocks: parseInt(activeLocksResult.rows[0]?.count) || 0,
        expiredLocks: parseInt(expiredLocksResult.rows[0]?.count) || 0,
        totalProcessingQueue: parseInt(queueResult.rows[0]?.count) || 0,
        failedRetries: parseInt(retryStats.rows[0]?.failed_retries) || 0,
        successfulCompletions: parseInt(retryStats.rows[0]?.successful_completions) || 0,
        averageLockDuration: parseFloat(retryStats.rows[0]?.avg_duration) || 0,
        lastCleanupRun: new Date()
      };

      return stats;

    } finally {
      client.release();
    }
  }

  /**
   * Force unlock a specific VOD (admin function)
   */
  async forceUnlockVod(twitchVodId: string, taskId: number, reason: string = 'Admin force unlock'): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      const twitchVodIdBigInt = BigInt(twitchVodId);

      const result = await client.query(`
        UPDATE vod_file_states
        SET 
          processing_locked_by = NULL,
          lock_timeout_at = NULL,
          operation_status = 'failed',
          error_details = jsonb_build_object(
            'error', $3,
            'force_unlocked_at', NOW()
          ),
          updated_at = NOW()
        WHERE twitch_vod_id = $1 AND task_id = $2
          AND processing_locked_by IS NOT NULL
        RETURNING id
      `, [twitchVodIdBigInt, taskId, reason]);

      const unlocked = (result.rowCount ?? 0) > 0;

      if (unlocked) {
        logger.warn(`Force unlocked VOD ${twitchVodId} for task ${taskId}: ${reason}`);
        this.emit('lock:force_unlocked', { twitchVodId, taskId, reason });
      }

      return unlocked;

    } finally {
      client.release();
    }
  }

  // Private helper methods

  private async releaseTaskLocks(taskId: number, client: PoolClient): Promise<number> {
    const result = await client.query(`
      UPDATE vod_file_states
      SET 
        processing_locked_by = NULL,
        lock_timeout_at = NULL,
        operation_status = CASE 
          WHEN operation_status = 'in_progress' THEN 'cancelled'
          ELSE operation_status
        END,
        error_details = jsonb_build_object(
          'error', 'Task deletion - locks released',
          'released_at', NOW()
        ),
        updated_at = NOW()
      WHERE task_id = $1 
        AND processing_locked_by IS NOT NULL
      RETURNING id
    `, [taskId]);

    const released = result.rowCount || 0;
    if (released > 0) {
      logger.info(`Released ${released} active locks for task ${taskId}`);
    }

    return released;
  }

  private async cleanupOrphanedRecords(client: PoolClient): Promise<{
    cleaned_vod_states: number;
    cleaned_completed_vods: number;
    cleaned_retention_tracking: number;
  }> {
    // Use database function for safe orphaned record cleanup
    const result = await client.query(`
      SELECT * FROM safe_cleanup_orphaned_vods()
    `);

    return result.rows[0] || {
      cleaned_vod_states: 0,
      cleaned_completed_vods: 0,
      cleaned_retention_tracking: 0
    };
  }

  private calculatePriority(operationStatus: string, retryCount: number): number {
    // Higher number = higher priority
    let basePriority = 0;
    
    switch (operationStatus) {
      case 'pending':
        basePriority = 100;
        break;
      case 'failed':
        basePriority = 50 - (retryCount * 10); // Lower priority with more retries
        break;
      default:
        basePriority = 0;
    }

    return Math.max(0, basePriority);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private startLockCleanupScheduler(): void {
    // Clean up expired locks every 5 minutes
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredLocks();
      } catch (error) {
        logger.error('Scheduled lock cleanup failed:', error);
      }
    }, 5 * 60 * 1000);

    logger.info('Started lock cleanup scheduler (5 minute interval)');
  }

  /**
   * Stop the lock cleanup scheduler
   */
  public stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Stopped lock cleanup scheduler');
    }
  }

  /**
   * Graceful shutdown - release all locks and stop scheduler
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down ConcurrentTaskManager...');
    
    this.stopCleanupScheduler();
    
    // Final cleanup of any remaining locks
    try {
      await this.cleanupExpiredLocks();
    } catch (error) {
      logger.error('Final lock cleanup failed during shutdown:', error);
    }

    logger.info('ConcurrentTaskManager shutdown complete');
  }
}

export default ConcurrentTaskManager;
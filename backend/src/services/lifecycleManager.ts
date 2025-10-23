// Filepath: backend/src/services/lifecycleManager.ts

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

interface LifecycleManagerConfig {
  cleanupInterval: number; // milliseconds
  lockTimeoutCleanup: number; // milliseconds  
  orphanedRecordCleanup: number; // milliseconds
}

export class LifecycleManager extends EventEmitter {
  private pool: Pool;
  private config: LifecycleManagerConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private lockCleanupInterval: NodeJS.Timeout | null = null;
  private orphanCleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(pool: Pool, config: Partial<LifecycleManagerConfig> = {}) {
    super();
    this.pool = pool;
    this.config = {
      cleanupInterval: config.cleanupInterval || 5 * 60 * 1000, // 5 minutes
      lockTimeoutCleanup: config.lockTimeoutCleanup || 2 * 60 * 1000, // 2 minutes
      orphanedRecordCleanup: config.orphanedRecordCleanup || 30 * 60 * 1000 // 30 minutes
    };
  }

  /**
   * Start the lifecycle manager background services
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Lifecycle manager is already running');
      return;
    }

    logger.info('Starting VOD Lifecycle Manager...');

    try {
      // Test database functions are available
      await this.testDatabaseFunctions();

      // Start periodic cleanup of expired locks
      this.lockCleanupInterval = setInterval(async () => {
        try {
          await this.cleanupExpiredLocks();
        } catch (error) {
          logger.error('Expired lock cleanup failed:', error);
          this.emit('cleanup:lock_error', error);
        }
      }, this.config.lockTimeoutCleanup);

      // Start periodic cleanup of orphaned records
      this.orphanCleanupInterval = setInterval(async () => {
        try {
          await this.cleanupOrphanedRecords();
        } catch (error) {
          logger.error('Orphaned record cleanup failed:', error);
          this.emit('cleanup:orphan_error', error);
        }
      }, this.config.orphanedRecordCleanup);

      // Perform initial cleanup
      await this.performInitialCleanup();

      this.isRunning = true;
      logger.info('VOD Lifecycle Manager started successfully');
      this.emit('lifecycle:started');

    } catch (error) {
      logger.error('Failed to start VOD Lifecycle Manager:', error);
      throw error;
    }
  }

  /**
   * Stop the lifecycle manager
   */
  public stop(): void {
    if (!this.isRunning) {
      logger.warn('Lifecycle manager is not running');
      return;
    }

    logger.info('Stopping VOD Lifecycle Manager...');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.lockCleanupInterval) {
      clearInterval(this.lockCleanupInterval);
      this.lockCleanupInterval = null;
    }

    if (this.orphanCleanupInterval) {
      clearInterval(this.orphanCleanupInterval);
      this.orphanCleanupInterval = null;
    }

    this.isRunning = false;
    logger.info('VOD Lifecycle Manager stopped');
    this.emit('lifecycle:stopped');
  }

  /**
   * Test that required database functions exist
   */
  private async testDatabaseFunctions(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Test each critical function
      const functions = [
        'cleanup_expired_vod_locks',
        'safe_cleanup_orphaned_vods',
        'safe_queue_vod_for_processing',
        'safe_release_vod_lock',
        'upsert_completed_vod'
      ];

      for (const funcName of functions) {
        const result = await client.query(`
          SELECT EXISTS(
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname = $1
          ) as exists
        `, [funcName]);

        if (!result.rows[0].exists) {
          throw new Error(`Required database function '${funcName}' not found. Please run lifecycle migrations.`);
        }
      }

      logger.debug('All required database functions are available');
    } finally {
      client.release();
    }
  }

  /**
   * Perform initial cleanup on startup
   */
  private async performInitialCleanup(): Promise<void> {
    logger.info('Performing initial lifecycle cleanup...');

    try {
      // Clean up expired locks
      const expiredLocks = await this.cleanupExpiredLocks();
      
      // Clean up orphaned records  
      const orphanedStats = await this.cleanupOrphanedRecords();

      logger.info('Initial lifecycle cleanup completed', {
        expiredLocks: expiredLocks,
        orphanedVodStates: orphanedStats.cleaned_vod_states,
        orphanedCompletedVods: orphanedStats.cleaned_completed_vods,
        orphanedRetentionTracking: orphanedStats.cleaned_retention_tracking
      });

      this.emit('cleanup:initial_complete', {
        expiredLocks,
        orphanedStats
      });

    } catch (error) {
      logger.error('Initial cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Clean up expired processing locks
   */
  public async cleanupExpiredLocks(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT cleanup_expired_vod_locks() as cleaned_count');
      const cleanedCount = result.rows[0]?.cleaned_count || 0;

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired VOD processing locks`);
        this.emit('cleanup:locks_cleaned', { count: cleanedCount });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Error cleaning up expired locks:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clean up orphaned database records
   */
  public async cleanupOrphanedRecords(): Promise<{
    cleaned_vod_states: number;
    cleaned_completed_vods: number;
    cleaned_retention_tracking: number;
  }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM safe_cleanup_orphaned_vods()');
      const stats = result.rows[0] || {
        cleaned_vod_states: 0,
        cleaned_completed_vods: 0,
        cleaned_retention_tracking: 0
      };

      const totalCleaned = stats.cleaned_vod_states + stats.cleaned_completed_vods + stats.cleaned_retention_tracking;

      if (totalCleaned > 0) {
        logger.info('Cleaned up orphaned database records:', stats);
        this.emit('cleanup:orphans_cleaned', stats);
      }

      return stats;
    } catch (error) {
      logger.error('Error cleaning up orphaned records:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get lifecycle system health status
   */
  public async getHealthStatus(): Promise<{
    isHealthy: boolean;
    issues: string[];
    stats: {
      expiredLocks: number;
      pendingOperations: number;
      failedOperations: number;
      totalFileStates: number;
    };
  }> {
    const client = await this.pool.connect();
    try {
      // Get expired locks count
      const expiredLocksResult = await client.query(`
        SELECT COUNT(*) as count
        FROM vod_file_states 
        WHERE lock_timeout_at < NOW() AND processing_locked_by IS NOT NULL
      `);

      // Get operation counts
      const operationStatsResult = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE operation_status = 'pending') as pending_ops,
          COUNT(*) FILTER (WHERE operation_status = 'failed') as failed_ops,
          COUNT(*) as total_files
        FROM vod_file_states
      `);

      const expiredLocks = parseInt(expiredLocksResult.rows[0].count);
      const operationStats = operationStatsResult.rows[0];
      const pendingOps = parseInt(operationStats.pending_ops || '0');
      const failedOps = parseInt(operationStats.failed_ops || '0');
      const totalFiles = parseInt(operationStats.total_files || '0');

      // Determine issues
      const issues = [];
      if (expiredLocks > 0) {
        issues.push(`${expiredLocks} expired processing locks need cleanup`);
      }
      if (failedOps > pendingOps * 0.1) { // More than 10% failure rate
        issues.push(`High failure rate: ${failedOps} failed operations vs ${pendingOps} pending`);
      }

      return {
        isHealthy: issues.length === 0,
        issues,
        stats: {
          expiredLocks,
          pendingOperations: pendingOps,
          failedOperations: failedOps,
          totalFileStates: totalFiles
        }
      };

    } finally {
      client.release();
    }
  }

  /**
   * Manual trigger for full cleanup cycle
   */
  public async performFullCleanup(): Promise<{
    expiredLocks: number;
    orphanedRecords: {
      cleaned_vod_states: number;
      cleaned_completed_vods: number;
      cleaned_retention_tracking: number;
    };
  }> {
    logger.info('Performing manual full lifecycle cleanup...');

    const expiredLocks = await this.cleanupExpiredLocks();
    const orphanedRecords = await this.cleanupOrphanedRecords();

    const result = {
      expiredLocks,
      orphanedRecords
    };

    logger.info('Manual full cleanup completed:', result);
    this.emit('cleanup:manual_complete', result);

    return result;
  }

  /**
   * Check if lifecycle manager is running
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get current configuration
   */
  public getConfig(): LifecycleManagerConfig {
    return { ...this.config };
  }
}

/**
 * Factory function to create lifecycle manager instance
 */
export const createLifecycleManager = (
  pool: Pool, 
  config?: Partial<LifecycleManagerConfig>
): LifecycleManager => {
  return new LifecycleManager(pool, config);
};

export default LifecycleManager;
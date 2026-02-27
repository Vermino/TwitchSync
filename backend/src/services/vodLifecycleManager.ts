// Filepath: backend/src/services/vodLifecycleManager.ts

import { Pool, PoolClient } from 'pg';
import { promises as fs } from 'fs';
import { EventEmitter } from 'events';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface RetentionPolicy {
  id?: number;
  userId?: number;
  taskId?: number;
  channelId?: number;
  retentionDays: number;
  autoDeleteEnabled: boolean;
  gracePeriodDays: number;
  maxStorageGb?: number;
  deleteOldestWhenFull: boolean;
  minDurationMinutes?: number;
  minViewCount?: number;
  excludeHighlights: boolean;
  excludePremieres: boolean;
  keepLastNVods?: number;
  keepVodsNewerThanDays?: number;
  customRules?: Record<string, any>;
  priority: number;
  isActive: boolean;
}

export interface RetentionEvaluation {
  vodId: number;
  twitchVodId: string;
  currentStatus: 'active' | 'eligible_deletion' | 'protected' | 'scheduled' | 'expired';
  recommendedAction: 'keep' | 'schedule_deletion' | 'delete_immediately' | 'protect';
  reason: string;
  eligibleForDeletionAt?: Date;
  scheduledDeletionAt?: Date;
  gracePeriodExpiresAt?: Date;
  storageSavingsBytes: number;
  appliedPolicyId?: number;
}

export interface CleanupExecution {
  taskId: number;
  scheduledDeletions: number;
  immediateDeletes: number;
  protectedFiles: number;
  totalSpaceToFree: number;
  errors: Array<{ vodId: number; error: string }>;
  executionTime: number;
}

export interface StorageAnalytics {
  userId: number;
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeGB: number;
  filesDownloaded: number;
  downloadedFiles: number;
  downloadedSizeGB: number;
  filesMissing: number;
  missingFiles: number;
  missingSizeGB: number;
  filesCorrupted: number;
  corruptedFiles: number;
  corruptedSizeGB: number;
  protectedFiles: number;
  protectedSizeGB: number;
  filesArchived: number;
  eligibleForDeletionCount: number;
  eligibleForDeletionBytes: number;
  eligibleForDeletionGb: number;
  largestFiles: Array<{ vodId: number; title: string; sizeBytes: number }>;
  channelBreakdown: Array<{ channelId: number; displayName: string; sizeGB: number }>;
  gameBreakdown: Array<{ gameId: number; gameName: string; sizeGB: number }>;
  storageTimeline: Array<{ date: string; totalSizeGB: number; downloadedSizeGB: number; files: number }>;
}

export interface TaskCreationContext {
  userId: number;
  taskName: string;
  channelIds: number[];
  gameIds: number[];
  criteriaHash: string;
}

export class VODLifecycleManager extends EventEmitter {
  private pool: Pool;
  private cleanupScheduled: boolean = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(pool: Pool) {
    super();
    this.pool = pool;
  }

  /**
   * Evaluate retention policies for all VODs and determine actions
   */
  async evaluateRetentionPolicies(userId: number, dryRun: boolean = false): Promise<RetentionEvaluation[]> {
    const client = await this.pool.connect();

    try {
      logger.info(`Evaluating retention policies for user ${userId} (dry run: ${dryRun})`);

      // Get all active retention policies for the user (hierarchical order)
      const policies = await this.getRetentionPolicies(userId, client);

      if (policies.length === 0) {
        logger.info(`No retention policies found for user ${userId}`);
        return [];
      }

      logger.info(`Found ${policies.length} retention policies for user ${userId}`);

      // Get all VODs for the user with their current states
      const vods = await this.getUserVodsForRetention(userId, client);

      if (vods.length === 0) {
        logger.info(`No VODs found for retention evaluation for user ${userId}`);
        return [];
      }

      logger.info(`Evaluating retention for ${vods.length} VODs`);

      const evaluations: RetentionEvaluation[] = [];

      // Process each VOD against the policy hierarchy
      for (const vod of vods) {
        const evaluation = await this.evaluateVodRetention(vod, policies, client);
        evaluations.push(evaluation);

        // Update database with evaluation results (if not dry run)
        if (!dryRun) {
          await this.updateRetentionTracking(vod.id, evaluation, client);
        }
      }

      // Generate summary statistics
      const summary = this.summarizeEvaluations(evaluations);
      logger.info(`Retention evaluation completed for user ${userId}`, summary);

      this.emit('retention:evaluated', { userId, evaluations, summary, dryRun });

      return evaluations;
    } finally {
      client.release();
    }
  }

  /**
   * Execute scheduled cleanup based on retention evaluations
   */
  async executeScheduledCleanup(userId: number, options: {
    maxDeletions?: number;
    maxSizeGB?: number;
    skipProtected?: boolean;
  } = {}): Promise<CleanupExecution> {
    const client = await this.pool.connect();
    const startTime = Date.now();

    try {
      await client.query('BEGIN');

      logger.info(`Executing scheduled cleanup for user ${userId}`, options);

      // Get VODs scheduled for deletion
      const vodsToDelete = await this.getVodsScheduledForDeletion(userId, client);

      if (vodsToDelete.length === 0) {
        logger.info(`No VODs scheduled for deletion for user ${userId}`);
        await client.query('COMMIT');
        return {
          taskId: 0,
          scheduledDeletions: 0,
          immediateDeletes: 0,
          protectedFiles: 0,
          totalSpaceToFree: 0,
          errors: [],
          executionTime: Date.now() - startTime
        };
      }

      let deletionCount = 0;
      let totalSpaceFreed = 0;
      const errors: Array<{ vodId: number; error: string }> = [];
      const maxDeletions = options.maxDeletions || Infinity;
      const maxSizeBytes = (options.maxSizeGB || Infinity) * 1024 * 1024 * 1024;

      // Process deletions with limits
      for (const vod of vodsToDelete) {
        if (deletionCount >= maxDeletions || totalSpaceFreed >= maxSizeBytes) {
          break;
        }

        // Check if VOD is protected
        if (options.skipProtected && vod.isUserProtected) {
          continue;
        }

        // Check grace period
        if (vod.gracePeriodExpiresAt && new Date() < vod.gracePeriodExpiresAt) {
          continue;
        }

        try {
          // Perform the actual file deletion
          const spaceFreed = await this.deleteVodFile(vod, client);
          totalSpaceFreed += spaceFreed;
          deletionCount++;

          logger.info(`Deleted VOD ${vod.twitchVodId}: ${path.basename(vod.filePath)} (${spaceFreed} bytes freed)`);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push({ vodId: vod.id, error: errorMessage });
          logger.error(`Failed to delete VOD ${vod.id}:`, error);
        }
      }

      const result: CleanupExecution = {
        taskId: 0,
        scheduledDeletions: deletionCount,
        immediateDeletes: 0,
        protectedFiles: vodsToDelete.filter(v => v.isUserProtected).length,
        totalSpaceToFree: totalSpaceFreed,
        errors,
        executionTime: Date.now() - startTime
      };

      await client.query('COMMIT');

      logger.info(`Cleanup execution completed for user ${userId}`, result);
      this.emit('cleanup:executed', { userId, result });

      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Cleanup execution failed for user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate md5 checksum of a file
   */
  private async calculateChecksum(filePath: string): Promise<string | null> {
    return new Promise((resolve) => {
      const hash = crypto.createHash('md5');
      // Use standard require('fs') to get createReadStream
      const stream = require('fs').createReadStream(filePath);

      stream.on('error', (err: any) => {
        logger.error(`Error reading file for checksum: ${err}`);
        resolve(null);
      });

      stream.on('data', (chunk: any) => {
        hash.update(chunk);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
    });
  }

  /**
   * Verify the integrity of a single VOD file
   */
  async verifyVodFile(vodId: number, deepCheck: boolean = false): Promise<{
    success: boolean;
    status: 'verified' | 'missing' | 'corrupted' | 'partial';
    expectedSize: number;
    actualSize: number;
    checksum?: string;
    error?: string;
  }> {
    const client = await this.pool.connect();
    const startTimeMs = Date.now();

    try {
      // Get VOD details
      const result = await client.query(`
        SELECT v.*, vfs.id as file_state_id, vfs.file_path, vfs.expected_size_bytes, vfs.file_size_bytes, vfs.checksum_md5
        FROM vods v
        LEFT JOIN vod_file_states vfs ON v.id = vfs.vod_id
        WHERE v.id = $1
      `, [vodId]);

      if (result.rows.length === 0) {
        throw new Error(`VOD ${vodId} not found`);
      }

      const vod = result.rows[0];
      const filePath = vod.file_path;

      if (!filePath) {
        return { success: false, status: 'missing', expectedSize: 0, actualSize: 0, error: 'No file path stored' };
      }

      let actualSize = 0;
      let checksum: string | null = null;
      let status: 'verified' | 'missing' | 'corrupted' | 'partial' = 'missing';
      let errorMessage: string | undefined;

      try {
        const stats = await fs.stat(filePath);
        actualSize = stats.size;

        // Basic check: size > 0
        if (actualSize === 0) {
          status = 'corrupted';
          errorMessage = 'File is empty';
        } else {
          // Compare against expected size if available
          const expectedSize = parseInt(vod.expected_size_bytes || vod.file_size_bytes || '0');
          if (expectedSize > 0 && Math.abs(actualSize - expectedSize) > 1024 * 1024) { // allow 1MB diff
            status = 'partial'; // might be incomplete
            errorMessage = `Size mismatch. Expected: ${expectedSize}, Actual: ${actualSize}`;
          } else {
            status = 'verified';

            if (deepCheck) {
              checksum = await this.calculateChecksum(filePath);
              if (vod.checksum_md5 && checksum && checksum !== vod.checksum_md5) {
                status = 'corrupted';
                errorMessage = 'Checksum mismatch';
              }
            }
          }
        }
      } catch (err) {
        status = 'missing';
        errorMessage = 'File not found on disk';
      }

      // Update the vod_file_states
      if (vod.file_state_id) {
        await client.query(`
          UPDATE vod_file_states
            SET
            file_state = $1,
              file_size_bytes = $2,
              verification_status = $3,
              last_verified_at = NOW(),
              updated_at = NOW(),
              checksum_md5 = COALESCE($4, checksum_md5)
          WHERE id = $5
              `, [
          status === 'verified' ? 'present' : status,
          actualSize,
          status === 'verified' ? 'verified' : 'failed',
          checksum,
          vod.file_state_id
        ]);

        // Insert into verification history
        await client.query(`
          INSERT INTO file_verification_history(
                file_state_id, verification_type, verification_status,
                file_exists, size_matches, checksum_matches,
                expected_checksum, actual_checksum,
                verification_duration_ms, file_size_checked,
                error_message, triggered_by, verification_depth
              ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          vod.file_state_id,
          deepCheck ? 'checksum' : 'size',
          status === 'verified' ? 'verified' : 'failed',
          status !== 'missing',
          status === 'verified' || status === 'corrupted' ? true : false,
          deepCheck ? (status === 'verified') : null,
          vod.checksum_md5,
          checksum,
          Date.now() - startTimeMs,
          actualSize,
          errorMessage,
          'user_request',
          deepCheck ? 'full' : 'basic'
        ]);
      }

      return {
        success: status === 'verified',
        status,
        expectedSize: parseInt(vod.expected_size_bytes || '0'),
        actualSize,
        checksum: checksum || undefined,
        error: errorMessage
      };

    } finally {
      client.release();
    }
  }

  /**
   * Bulk verify multiple files
   */
  async bulkVerifyFiles(userId?: number): Promise<{
    totalChecked: number;
    verified: number;
    missing: number;
    corrupted: number;
  }> {
    const client = await this.pool.connect();

    try {
      // Get files to verify (completed downloads only)
      let query = `
        SELECT v.id 
        FROM vods v
        JOIN vod_file_states vfs ON v.id = vfs.vod_id
        JOIN tasks t ON v.task_id = t.id
        WHERE vfs.file_state IN ('present', 'missing', 'corrupted', 'partial')
      `;
      const queryParams: any[] = [];

      if (userId) {
        query += ` AND t.user_id = $1`;
        queryParams.push(userId);
      }

      const result = await client.query(query, queryParams);
      const vodIds = result.rows.map(r => r.id);

      let verified = 0;
      let missing = 0;
      let corrupted = 0;

      // Verify sequentially to not overwhelm disk IO, but do shallow checks
      for (const id of vodIds) {
        try {
          const res = await this.verifyVodFile(id, false);
          if (res.status === 'verified') verified++;
          else if (res.status === 'missing') missing++;
          else corrupted++;
        } catch (e) {
          logger.error(`Failed to verify VOD ${id} during bulk verification:`, e);
          corrupted++;
        }
      }

      return {
        totalChecked: vodIds.length,
        verified,
        missing,
        corrupted
      };
    } finally {
      client.release();
    }
  }

  /**
   * Handle task creation with duplication prevention
   */
  async handleTaskCreation(context: TaskCreationContext): Promise<{
    allowCreation: boolean;
    existingTaskId?: number;
    duplicateVods: Array<{ twitchVodId: string; taskId: number }>;
    recommendations: string[];
  }> {
    const client = await this.pool.connect();

    try {
      logger.info(`Checking task creation for potential duplicates`, context);

      // Check if this task criteria already exists
      const existingTracking = await client.query(`
        SELECT 
          id, original_task_id, task_name,
                total_vods_discovered, total_vods_downloaded,
                completed_vods_list, is_active
        FROM task_recreation_tracking
        WHERE user_id = $1 AND criteria_hash = $2
              `, [context.userId, context.criteriaHash]);

      if (existingTracking.rows.length === 0) {
        // New task criteria - allow creation and start tracking
        await this.createTaskRecreationTracking(context, client);

        return {
          allowCreation: true,
          duplicateVods: [],
          recommendations: ['New task criteria - creation allowed']
        };
      }

      const tracking = existingTracking.rows[0];
      const completedVods = tracking.completed_vods_list || [];
      const recommendations: string[] = [];

      // Check if original task still exists
      let existingTaskId: number | undefined;
      if (tracking.original_task_id) {
        const taskCheck = await client.query(`
          SELECT id FROM tasks WHERE id = $1 AND is_active = true
              `, [tracking.original_task_id]);

        if (taskCheck.rows.length > 0) {
          existingTaskId = tracking.original_task_id;
          recommendations.push(`Active task #${existingTaskId} already exists with same criteria`);
        }
      }

      // Get VODs that would be duplicated
      const duplicateVods = await this.findDuplicateVods(context, completedVods, client);

      // Determine if creation should be allowed
      let allowCreation = false;

      if (!existingTaskId) {
        // Original task deleted, check for duplicates
        if (duplicateVods.length === 0) {
          allowCreation = true;
          recommendations.push('Original task deleted and no duplicate VODs found - creation allowed');
        } else {
          recommendations.push(`${duplicateVods.length} VODs would be duplicated from previous task`);
          recommendations.push('Consider using "new VODs only" option or redownload missing files');

          // Allow creation but recommend caution
          allowCreation = true;
        }
      } else {
        recommendations.push('Existing active task found - creation not recommended');
      }

      logger.info(`Task creation evaluation completed`, {
        allowCreation,
        existingTaskId,
        duplicateCount: duplicateVods.length
      });

      return {
        allowCreation,
        existingTaskId,
        duplicateVods,
        recommendations
      };

    } finally {
      client.release();
    }
  }

  /**
   * Generate comprehensive storage analytics for a user
   */
  async generateStorageAnalytics(userId: number): Promise<StorageAnalytics> {
    const client = await this.pool.connect();

    try {
      logger.info(`Generating storage analytics for user ${userId}`);

      // Get overall statistics
      const statsQuery = `
        SELECT
              COUNT(*) as total_files,
              COALESCE(SUM(vfs.file_size_bytes), 0) as total_size_bytes,
              COUNT(*) FILTER(WHERE vfs.file_state = 'present') as files_downloaded,
              COALESCE(SUM(vfs.file_size_bytes) FILTER(WHERE vfs.file_state = 'present'), 0) as downloaded_size_bytes,
              COUNT(*) FILTER(WHERE vfs.file_state = 'missing') as files_missing,
              COALESCE(SUM(vfs.file_size_bytes) FILTER(WHERE vfs.file_state = 'missing'), 0) as missing_size_bytes,
              COUNT(*) FILTER(WHERE vfs.file_state = 'corrupted') as files_corrupted,
              COALESCE(SUM(vfs.file_size_bytes) FILTER(WHERE vfs.file_state = 'corrupted'), 0) as corrupted_size_bytes,
              COUNT(*) FILTER(WHERE vfs.file_state = 'archived') as files_archived,
              COUNT(*) FILTER(WHERE vfs.is_user_protected = true) as protected_files,
              COALESCE(SUM(vfs.file_size_bytes) FILTER(WHERE vfs.is_user_protected = true), 0) as protected_size_bytes
        FROM vod_file_states vfs
        JOIN vods v ON vfs.vod_id = v.id
        JOIN tasks t ON v.task_id = t.id
        WHERE t.user_id = $1
              `;

      const statsResult = await client.query(statsQuery, [userId]);
      const stats = statsResult.rows[0];

      // Get deletion eligibility stats
      const deletionQuery = `
            SELECT
            COUNT(*) as eligible_count,
              COALESCE(SUM(vrt.storage_savings_bytes), 0) as eligible_bytes
        FROM vod_retention_tracking vrt
        JOIN vods v ON vrt.vod_id = v.id
        JOIN tasks t ON v.task_id = t.id
        WHERE t.user_id = $1 
          AND vrt.retention_status = 'eligible_deletion'
              `;

      const deletionResult = await client.query(deletionQuery, [userId]);
      const deletion = deletionResult.rows[0];

      // Get largest files
      const largestFilesQuery = `
            SELECT
            v.id as vod_id,
              v.title,
              vfs.file_size_bytes as size_bytes
        FROM vod_file_states vfs
        JOIN vods v ON vfs.vod_id = v.id
        JOIN tasks t ON v.task_id = t.id
        WHERE t.user_id = $1 
          AND vfs.file_size_bytes > 0
        ORDER BY vfs.file_size_bytes DESC
        LIMIT 10
              `;

      const largestFilesResult = await client.query(largestFilesQuery, [userId]);

      // Get channels by size
      const channelsBySize = await client.query(`
            SELECT
            c.id as channel_id,
              c.display_name as channel_name,
              COALESCE(SUM(vfs.file_size_bytes), 0) as total_size_bytes
        FROM channels c
        JOIN vods v ON c.id = v.channel_id
        JOIN vod_file_states vfs ON v.id = vfs.vod_id
        JOIN tasks t ON v.task_id = t.id
        WHERE t.user_id = $1 
          AND vfs.file_size_bytes > 0
        GROUP BY c.id, c.display_name
        ORDER BY total_size_bytes DESC
        LIMIT 10
              `, [userId]);

      // Get games by size
      const gamesBySize = await client.query(`
            SELECT
            g.id as game_id,
              g.name as game_name,
              COALESCE(SUM(vfs.file_size_bytes), 0) as total_size_bytes
        FROM games g
        JOIN vods v ON g.id = v.game_id
        JOIN vod_file_states vfs ON v.id = vfs.vod_id
        JOIN tasks t ON v.task_id = t.id
        WHERE t.user_id = $1 
          AND vfs.file_size_bytes > 0
        GROUP BY g.id, g.name
        ORDER BY total_size_bytes DESC
        LIMIT 10
      `, [userId]);

      // Get storage timeline (last 6 months)
      const timelineResult = await client.query(`
        SELECT 
          TO_CHAR(snapshot_date, 'YYYY-MM') as month,
          MAX(total_size_gb) as total_size_gb,
          MAX(downloaded_size_bytes) as downloaded_size_bytes,
          MAX(total_files) as files
        FROM storage_analytics
        WHERE user_id = $1 
          AND snapshot_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY TO_CHAR(snapshot_date, 'YYYY-MM')
        ORDER BY month ASC
      `, [userId]);

      const analytics = {
        userId,
        totalFiles: parseInt(stats.total_files) || 0,
        totalSizeBytes: parseInt(stats.total_size_bytes) || 0,
        totalSizeGB: (parseInt(stats.total_size_bytes) || 0) / (1024 * 1024 * 1024),
        filesDownloaded: parseInt(stats.files_downloaded) || 0,
        downloadedFiles: parseInt(stats.files_downloaded) || 0,
        downloadedSizeGB: (parseInt(stats.downloaded_size_bytes) || 0) / (1024 * 1024 * 1024),
        protectedFiles: parseInt(stats.protected_files) || 0,
        protectedSizeGB: (parseInt(stats.protected_size_bytes) || 0) / (1024 * 1024 * 1024),
        filesMissing: parseInt(stats.files_missing) || 0,
        missingFiles: parseInt(stats.files_missing) || 0,
        missingSizeGB: (parseInt(stats.missing_size_bytes) || 0) / (1024 * 1024 * 1024),
        filesCorrupted: parseInt(stats.files_corrupted) || 0,
        corruptedFiles: parseInt(stats.files_corrupted) || 0,
        corruptedSizeGB: (parseInt(stats.corrupted_size_bytes) || 0) / (1024 * 1024 * 1024),
        filesArchived: parseInt(stats.files_archived) || 0,
        eligibleForDeletionCount: parseInt(deletion.eligible_count) || 0,
        eligibleForDeletionBytes: parseInt(deletion.eligible_bytes) || 0,
        eligibleForDeletionGb: (parseInt(deletion.eligible_bytes) || 0) / (1024 * 1024 * 1024),
        largestFiles: largestFilesResult.rows.map(row => ({
          vodId: row.vod_id,
          title: row.title,
          sizeBytes: parseInt(row.size_bytes)
        })),
        channelBreakdown: channelsBySize.rows.map(row => ({
          channelId: row.channel_id,
          displayName: row.channel_name,
          sizeGB: parseInt(row.total_size_bytes) / (1024 * 1024 * 1024)
        })),
        gameBreakdown: gamesBySize.rows.map(row => ({
          gameId: row.game_id,
          gameName: row.game_name,
          sizeGB: parseInt(row.total_size_bytes) / (1024 * 1024 * 1024)
        })),
        storageTimeline: timelineResult.rows.map(row => ({
          date: row.month,
          totalSizeGB: parseFloat(row.total_size_gb) || 0,
          downloadedSizeGB: (parseInt(row.downloaded_size_bytes) || 0) / (1024 * 1024 * 1024),
          files: parseInt(row.files) || 0
        }))
      };

      // Store analytics snapshot
      await this.storeAnalyticsSnapshot(analytics, client);

      logger.info(`Storage analytics generated for user ${userId}`, {
        totalFiles: analytics.totalFiles,
        totalSizeGb: analytics.totalSizeGB.toFixed(2),
        eligibleDeletionGb: analytics.eligibleForDeletionGb.toFixed(2)
      });

      this.emit('analytics:generated', { userId, analytics });

      return analytics;

    } finally {
      client.release();
    }
  }

  /**
   * Analyze files eligible for cleanup without executing
   */
  public async analyzeCleanupCandidates(userId: number) {
    try {
      // Re-use evaluateRetentionPolicies which does the heavy lifting
      const evaluations = await this.evaluateRetentionPolicies(userId, true);

      const eligibleEvaluations = evaluations.filter(e =>
        e.recommendedAction === 'schedule_deletion' ||
        e.recommendedAction === 'delete_immediately'
      );

      const totalSpaceSavingBytes = eligibleEvaluations.reduce((acc, curr) => acc + (curr.storageSavingsBytes || 0), 0);

      let oldestDate: Date | null = null;
      let policyViolations = 0;
      let byStorageLimit = 0;
      let byPolicy = 0;
      let byCorruption = 0;

      const eligibleFiles = eligibleEvaluations.map(e => {
        // Track the oldest file
        if (e.eligibleForDeletionAt) {
          const date = new Date(e.eligibleForDeletionAt);
          if (!oldestDate || date < oldestDate) {
            oldestDate = date;
          }
        }

        // Categorize reasons
        if (e.reason.includes('Storage limit exceeded')) byStorageLimit++;
        else if (e.reason.includes('corrupted')) byCorruption++;
        else byPolicy++;

        return {
          vodId: e.vodId,
          twitchVodId: e.twitchVodId,
          action: e.recommendedAction,
          reason: e.reason,
          savingsBytes: e.storageSavingsBytes
        };
      });

      return {
        eligibleFiles,
        totalSpaceSavingGB: totalSpaceSavingBytes / (1024 * 1024 * 1024),
        oldestFileAge: oldestDate,
        retentionPolicyViolations: policyViolations, // Usually 0 if policies are run regularly
        byRetentionPolicy: byPolicy,
        byStorageLimit,
        byCorruption
      };
    } catch (error) {
      logger.error(`Error analyzing cleanup candidates for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Execute manual cleanup for specific files
   */
  public async executeCleanup(userId: number, fileIds: number[], dryRun: boolean = false) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      let filesProcessed = 0;
      let spaceSavedBytes = 0;
      const errors: Array<{ vodId: number, error: string }> = [];

      // Get the VODs to verify they belong to the user
      const query = `
        SELECT v.* 
        FROM vods v
        JOIN tasks t ON v.task_id = t.id
        WHERE v.id = ANY($1) AND t.user_id = $2
      `;
      const result = await client.query(query, [fileIds, userId]);
      const vodsToProcess = result.rows;

      if (vodsToProcess.length === 0) {
        await client.query('ROLLBACK');
        return { success: true, dryRun, filesProcessed: 0, spaceSavedGB: 0, errors };
      }

      for (const vod of vodsToProcess) {
        try {
          if (!dryRun) {
            const saved = await this.deleteVodFile(vod, client);
            spaceSavedBytes += saved;
          } else {
            // Estimate savings for dry run
            spaceSavedBytes += parseInt(vod.file_size_bytes || '0');
          }
          filesProcessed++;
        } catch (error: any) {
          logger.error(`Error processing cleanup for VOD ${vod.id}:`, error);
          errors.push({ vodId: vod.id, error: error.message });
        }
      }

      if (!dryRun) {
        await client.query('COMMIT');
      } else {
        await client.query('ROLLBACK');
      }

      return {
        success: true,
        dryRun,
        filesProcessed,
        spaceSavedGB: spaceSavedBytes / (1024 * 1024 * 1024),
        errors
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error executing manual cleanup for user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Start automated cleanup scheduler
   */
  async startCleanupScheduler(intervalHours: number = 6): Promise<void> {
    if (this.cleanupScheduled) {
      logger.warn('Cleanup scheduler is already running');
      return;
    }

    this.cleanupScheduled = true;
    const intervalMs = intervalHours * 60 * 60 * 1000;

    logger.info(`Starting cleanup scheduler with ${intervalHours}h interval`);

    const runScheduledCleanup = async () => {
      try {
        // Get all users with retention policies
        const usersWithPolicies = await this.getUsersWithRetentionPolicies();

        for (const userId of usersWithPolicies) {
          try {
            await this.evaluateRetentionPolicies(userId, false);
            await this.executeScheduledCleanup(userId, {
              maxDeletions: 100,
              maxSizeGB: 10,
              skipProtected: true
            });
          } catch (error) {
            logger.error(`Scheduled cleanup failed for user ${userId}: `, error);
          }
        }
      } catch (error) {
        logger.error('Scheduled cleanup run failed:', error);
      }
    };

    // Run initial cleanup
    setImmediate(runScheduledCleanup);

    // Schedule recurring cleanup
    this.cleanupInterval = setInterval(runScheduledCleanup, intervalMs);

    this.emit('cleanup:scheduler_started', { intervalHours });
  }

  /**
   * Stop automated cleanup scheduler
   */
  stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.cleanupScheduled = false;
    logger.info('Cleanup scheduler stopped');
    this.emit('cleanup:scheduler_stopped');
  }

  // Private helper methods

  private async getRetentionPolicies(userId: number, client: PoolClient): Promise<RetentionPolicy[]> {
    const result = await client.query(`
            SELECT
            id, user_id, task_id, channel_id,
              retention_days, auto_delete_enabled, grace_period_days,
              max_storage_gb, delete_oldest_when_full,
              min_duration_minutes, min_view_count,
              exclude_highlights, exclude_premieres,
              keep_last_n_vods, keep_vods_newer_than_days,
              custom_rules, priority, is_active
      FROM vod_retention_policies
      WHERE user_id = $1 AND is_active = true
      ORDER BY priority DESC, id ASC
              `, [userId]);

    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      taskId: row.task_id,
      channelId: row.channel_id,
      retentionDays: row.retention_days,
      autoDeleteEnabled: row.auto_delete_enabled,
      gracePeriodDays: row.grace_period_days,
      maxStorageGb: row.max_storage_gb,
      deleteOldestWhenFull: row.delete_oldest_when_full,
      minDurationMinutes: row.min_duration_minutes,
      minViewCount: row.min_view_count,
      excludeHighlights: row.exclude_highlights,
      excludePremieres: row.exclude_premieres,
      keepLastNVods: row.keep_last_n_vods,
      keepVodsNewerThanDays: row.keep_vods_newer_than_days,
      customRules: row.custom_rules,
      priority: row.priority,
      isActive: row.is_active
    }));
  }

  private async getUserVodsForRetention(userId: number, client: PoolClient): Promise<any[]> {
    const result = await client.query(`
            SELECT
            v.id, v.twitch_id, v.task_id, v.channel_id, v.title,
              v.content_type, v.view_count, v.published_at, v.duration,
              vfs.file_state, vfs.file_size_bytes, vfs.file_path,
              vrt.retention_status, vrt.user_protected_until
      FROM vods v
      JOIN tasks t ON v.task_id = t.id
      LEFT JOIN vod_file_states vfs ON v.id = vfs.vod_id
      LEFT JOIN vod_retention_tracking vrt ON v.id = vrt.vod_id
      WHERE t.user_id = $1
        AND v.download_status = 'completed'
        AND vfs.file_state IN('present', 'archived')
      ORDER BY v.published_at DESC
    `, [userId]);

    return result.rows;
  }

  private async evaluateVodRetention(vod: any, policies: RetentionPolicy[], client: PoolClient): Promise<RetentionEvaluation> {
    const applicablePolicy = this.findApplicablePolicy(vod, policies);

    if (!applicablePolicy) {
      return {
        vodId: vod.id,
        twitchVodId: vod.twitch_id.toString(),
        currentStatus: 'active',
        recommendedAction: 'keep',
        reason: 'No applicable retention policy found',
        storageSavingsBytes: 0
      };
    }

    const now = new Date();
    const publishedAt = new Date(vod.published_at);
    const ageInDays = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);

    // Check if VOD is user protected
    if (vod.user_protected_until && new Date(vod.user_protected_until) > now) {
      return {
        vodId: vod.id,
        twitchVodId: vod.twitch_id.toString(),
        currentStatus: 'protected',
        recommendedAction: 'keep',
        reason: 'VOD is user protected',
        storageSavingsBytes: 0,
        appliedPolicyId: applicablePolicy.id
      };
    }

    // Apply retention rules
    let recommendedAction: 'keep' | 'schedule_deletion' | 'delete_immediately' | 'protect' = 'keep';
    let reason = 'Within retention period';
    let currentStatus: 'active' | 'eligible_deletion' | 'protected' | 'scheduled' | 'expired' = 'active';

    // Check age-based retention
    if (ageInDays > applicablePolicy.retentionDays) {
      currentStatus = 'eligible_deletion';
      recommendedAction = applicablePolicy.autoDeleteEnabled ? 'schedule_deletion' : 'keep';
      reason = `VOD is ${Math.round(ageInDays)} days old, exceeds retention period of ${applicablePolicy.retentionDays} days`;
    }

    // Check content filters
    if (this.shouldExcludeByFilters(vod, applicablePolicy)) {
      currentStatus = 'eligible_deletion';
      recommendedAction = 'schedule_deletion';
      reason = 'VOD filtered out by content rules';
    }

    // Calculate deletion dates
    let eligibleForDeletionAt: Date | undefined;
    let scheduledDeletionAt: Date | undefined;
    let gracePeriodExpiresAt: Date | undefined;

    if (currentStatus === 'eligible_deletion') {
      eligibleForDeletionAt = new Date(publishedAt);
      eligibleForDeletionAt.setDate(eligibleForDeletionAt.getDate() + applicablePolicy.retentionDays);

      if (applicablePolicy.autoDeleteEnabled) {
        scheduledDeletionAt = new Date(eligibleForDeletionAt);
        gracePeriodExpiresAt = new Date(scheduledDeletionAt);
        gracePeriodExpiresAt.setDate(gracePeriodExpiresAt.getDate() + applicablePolicy.gracePeriodDays);
      }
    }

    return {
      vodId: vod.id,
      twitchVodId: vod.twitch_id.toString(),
      currentStatus,
      recommendedAction,
      reason,
      eligibleForDeletionAt,
      scheduledDeletionAt,
      gracePeriodExpiresAt,
      storageSavingsBytes: vod.file_size_bytes || 0,
      appliedPolicyId: applicablePolicy.id
    };
  }

  private findApplicablePolicy(vod: any, policies: RetentionPolicy[]): RetentionPolicy | null {
    // Find most specific policy (channel > task > user)
    for (const policy of policies) {
      if (policy.channelId && policy.channelId === vod.channel_id) {
        return policy;
      }
      if (policy.taskId && policy.taskId === vod.task_id) {
        return policy;
      }
      if (!policy.taskId && !policy.channelId) {
        return policy; // User-level policy
      }
    }
    return null;
  }

  private shouldExcludeByFilters(vod: any, policy: RetentionPolicy): boolean {
    // Check content type exclusions
    if (policy.excludeHighlights && vod.content_type === 'highlight') {
      return true;
    }
    if (policy.excludePremieres && vod.content_type === 'premiere') {
      return true;
    }

    // Check minimum duration
    if (policy.minDurationMinutes && vod.duration) {
      const durationMinutes = this.parseDurationToMinutes(vod.duration);
      if (durationMinutes < policy.minDurationMinutes) {
        return true;
      }
    }

    // Check minimum view count
    if (policy.minViewCount && vod.view_count < policy.minViewCount) {
      return true;
    }

    return false;
  }

  private parseDurationToMinutes(duration: string): number {
    // Parse duration format like "2h30m45s" or "1h23m" or "45m30s"
    const hours = duration.match(/(\d+)h/)?.[1] || '0';
    const minutes = duration.match(/(\d+)m/)?.[1] || '0';
    return parseInt(hours) * 60 + parseInt(minutes);
  }

  private summarizeEvaluations(evaluations: RetentionEvaluation[]): Record<string, any> {
    const summary = {
      total: evaluations.length,
      active: 0,
      eligibleForDeletion: 0,
      protected: 0,
      scheduled: 0,
      totalSavingsBytes: 0,
      averageAge: 0
    };

    evaluations.forEach(evaluation => {
      switch (evaluation.currentStatus) {
        case 'active':
          summary.active++;
          break;
        case 'eligible_deletion':
          summary.eligibleForDeletion++;
          break;
        case 'protected':
          summary.protected++;
          break;
        case 'scheduled':
          summary.scheduled++;
          break;
      }
      summary.totalSavingsBytes += evaluation.storageSavingsBytes;
    });

    return summary;
  }

  private async updateRetentionTracking(vodId: number, evaluation: RetentionEvaluation, client: PoolClient): Promise<void> {
    await client.query(`
      INSERT INTO vod_retention_tracking(
                vod_id, retention_status, eligible_for_deletion_at,
                scheduled_deletion_at, grace_period_expires_at,
                storage_savings_bytes, last_evaluated_at, retention_policy_id
              ) VALUES($1, $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT(vod_id) DO UPDATE SET
            retention_status = EXCLUDED.retention_status,
              eligible_for_deletion_at = EXCLUDED.eligible_for_deletion_at,
              scheduled_deletion_at = EXCLUDED.scheduled_deletion_at,
              grace_period_expires_at = EXCLUDED.grace_period_expires_at,
              storage_savings_bytes = EXCLUDED.storage_savings_bytes,
              last_evaluated_at = NOW(),
              retention_policy_id = EXCLUDED.retention_policy_id,
              updated_at = NOW()
                `, [
      vodId,
      evaluation.currentStatus,
      evaluation.eligibleForDeletionAt,
      evaluation.scheduledDeletionAt,
      evaluation.gracePeriodExpiresAt,
      evaluation.storageSavingsBytes,
      evaluation.appliedPolicyId
    ]);
  }

  private async getVodsScheduledForDeletion(userId: number, client: PoolClient): Promise<any[]> {
    const result = await client.query(`
            SELECT
            v.id, v.twitch_id, vfs.file_path, vfs.file_size_bytes,
              vrt.scheduled_deletion_at, vrt.grace_period_expires_at,
              vfs.is_user_protected
      FROM vod_retention_tracking vrt
      JOIN vods v ON vrt.vod_id = v.id
      JOIN tasks t ON v.task_id = t.id
      JOIN vod_file_states vfs ON v.id = vfs.vod_id
      WHERE t.user_id = $1
        AND vrt.retention_status = 'eligible_deletion'
        AND vrt.scheduled_deletion_at IS NOT NULL
        AND vrt.scheduled_deletion_at <= NOW()
        AND vfs.file_state = 'present'
      ORDER BY vrt.scheduled_deletion_at ASC
              `, [userId]);

    return result.rows.map(row => ({
      id: row.id,
      twitchVodId: row.twitch_id.toString(),
      filePath: row.file_path,
      fileSizeBytes: parseInt(row.file_size_bytes) || 0,
      scheduledDeletionAt: new Date(row.scheduled_deletion_at),
      gracePeriodExpiresAt: row.grace_period_expires_at ? new Date(row.grace_period_expires_at) : null,
      isUserProtected: row.is_user_protected
    }));
  }

  private async deleteVodFile(vod: any, client: PoolClient): Promise<number> {
    const filePath = vod.filePath;
    const fileSize = vod.fileSizeBytes;

    try {
      // Delete physical file
      await fs.unlink(filePath);

      // Update database
      await client.query(`
        UPDATE vod_file_states
            SET
            file_state = 'deleted',
              operation_status = 'completed',
              file_path = NULL,
              updated_at = NOW()
        WHERE vod_id = $1
              `, [vod.id]);

      await client.query(`
        UPDATE vod_retention_tracking
            SET
            retention_status = 'expired',
              updated_at = NOW()
        WHERE vod_id = $1
              `, [vod.id]);

      return fileSize;
    } catch (error) {
      logger.error(`Failed to delete file ${filePath}: `, error);
      throw error;
    }
  }

  private async createTaskRecreationTracking(context: TaskCreationContext, client: PoolClient): Promise<void> {
    await client.query(`
      INSERT INTO task_recreation_tracking(
                user_id, criteria_hash, task_name, channel_ids, game_ids,
                prevent_redownload, allow_new_vods_only, redownload_missing_files
              ) VALUES($1, $2, $3, $4, $5, true, true, false)
                `, [
      context.userId,
      context.criteriaHash,
      context.taskName,
      context.channelIds,
      context.gameIds
    ]);
  }

  private async findDuplicateVods(context: TaskCreationContext, completedVods: string[], client: PoolClient): Promise<Array<{ twitchVodId: string; taskId: number }>> {
    if (completedVods.length === 0) {
      return [];
    }

    const result = await client.query(`
      SELECT DISTINCT v.twitch_id, v.task_id
      FROM vods v
      JOIN tasks t ON v.task_id = t.id
      WHERE t.user_id = $1 
        AND v.twitch_id:: text = ANY($2)
        AND v.download_status = 'completed'
              `, [context.userId, completedVods]);

    return result.rows.map(row => ({
      twitchVodId: row.twitch_id.toString(),
      taskId: row.task_id
    }));
  }

  private async storeAnalyticsSnapshot(analytics: StorageAnalytics, client: PoolClient): Promise<void> {
    await client.query(`
      INSERT INTO storage_analytics(
                user_id, total_files, total_size_bytes, files_downloaded,
                files_missing, files_corrupted, files_archived,
                eligible_for_deletion_count, eligible_for_deletion_bytes,
                largest_files_data, channels_by_size, games_by_size,
                calculation_duration_ms
              ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0)
      ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
            total_files = EXCLUDED.total_files,
              total_size_bytes = EXCLUDED.total_size_bytes,
              files_downloaded = EXCLUDED.files_downloaded,
              files_missing = EXCLUDED.files_missing,
              files_corrupted = EXCLUDED.files_corrupted,
              files_archived = EXCLUDED.files_archived,
              eligible_for_deletion_count = EXCLUDED.eligible_for_deletion_count,
              eligible_for_deletion_bytes = EXCLUDED.eligible_for_deletion_bytes,
              largest_files_data = EXCLUDED.largest_files_data,
              channels_by_size = EXCLUDED.channels_by_size,
              games_by_size = EXCLUDED.games_by_size,
              created_at = NOW()
                `, [
      analytics.userId,
      analytics.totalFiles,
      analytics.totalSizeBytes,
      analytics.filesDownloaded,
      analytics.filesMissing,
      analytics.filesCorrupted,
      analytics.filesArchived,
      analytics.eligibleForDeletionCount,
      analytics.eligibleForDeletionBytes,
      JSON.stringify(analytics.largestFiles),
      JSON.stringify(analytics.channelBreakdown),
      JSON.stringify(analytics.gameBreakdown)
    ]);
  }

  private async getUsersWithRetentionPolicies(): Promise<number[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(`
        SELECT DISTINCT user_id 
        FROM vod_retention_policies 
        WHERE is_active = true
              `);

      return result.rows.map(row => row.user_id);
    } finally {
      client.release();
    }
  }
}

export default VODLifecycleManager;
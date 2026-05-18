// @ts-nocheck
// Filepath: backend/src/services/downloadManager/handlers/downloadHandler.integration.example.ts

/**
 * INTEGRATION EXAMPLE: How to integrate CompletedVodService into the DownloadHandler
 * 
 * This file demonstrates how to modify the existing DownloadHandler to use the new
 * completed VOD tracking functionality. This is an example - not production code.
 */

import { CompletedVodService } from '../../completedVodService';
import { logger } from '../../../utils/logger';
import * as crypto from 'crypto';
import * as fs from 'fs';

// Example of how to integrate into the download completion logic
export class DownloadHandlerWithCompletedTracking {
  private completedVodService: CompletedVodService;

  // In the constructor, initialize the service
  constructor(pool: any, tempDir: string, maxConcurrent: number = 3) {
    // ... existing constructor code ...
    this.completedVodService = new CompletedVodService(pool);
  }

  /**
   * Example of how to check if a VOD is already completed before starting download
   */
  async shouldSkipVod(vod: any): Promise<boolean> {
    try {
      const isCompleted = await this.completedVodService.isVodCompleted(
        vod.twitch_id,
        vod.task_id
      );
      
      if (isCompleted) {
        logger.info(`Skipping VOD ${vod.twitch_id} - already completed for task ${vod.task_id}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking VOD completion status:', error);
      return false; // Don't skip on error
    }
  }

  /**
   * Example of how to integrate completion tracking into the download finish logic
   * This would replace/enhance the existing completion code in downloadVOD method
   */
  async markDownloadCompleted(vod: any, finalVideoPath: string, downloadStartTime: Date): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Calculate download metrics
      const downloadEndTime = new Date();
      const downloadDurationSeconds = Math.round(
        (downloadEndTime.getTime() - downloadStartTime.getTime()) / 1000
      );

      // Get file stats
      const stats = await fs.promises.stat(finalVideoPath);
      const fileSizeBytes = stats.size;
      const fileName = require('path').basename(finalVideoPath);

      // Calculate download speed in Mbps
      const downloadSpeedMbps = downloadDurationSeconds > 0 
        ? Number(((fileSizeBytes * 8) / (downloadDurationSeconds * 1000000)).toFixed(2))
        : null;

      // Calculate MD5 checksum for integrity verification
      const checksum = await this.calculateMD5(finalVideoPath);

      // Existing VOD status update
      await client.query(`
        UPDATE vods
        SET download_status   = 'completed',
            downloaded_at     = NOW(),
            updated_at        = NOW(),
            download_progress = 100,
            download_path     = $2,
            file_size         = $3,
            checksum          = $4
        WHERE id = $1
      `, [vod.id, finalVideoPath, fileSizeBytes, checksum]);

      // NEW: Track completion in completed_vods table
      await this.completedVodService.markVodCompleted({
        vod_id: vod.id,
        task_id: vod.task_id,
        twitch_id: vod.twitch_id,
        file_path: finalVideoPath,
        file_name: fileName,
        file_size_bytes: fileSizeBytes,
        download_duration_seconds: downloadDurationSeconds,
        download_speed_mbps: downloadSpeedMbps ?? undefined,
        checksum_md5: checksum,
        metadata: {
          quality: vod.preferred_quality || 'source',
          format: 'mp4',
          duration: vod.duration,
          title: vod.title,
          channel_name: vod.channel_name || 'unknown',
          completed_timestamp: downloadEndTime.toISOString()
        }
      });

      // Update task progress (existing code)
      await client.query(`
        UPDATE task_monitoring
        SET status              = 'completed',
            status_message      = 'Download completed successfully',
            progress_percentage = 100,
            items_completed     = items_completed + 1,
            updated_at          = NOW()
        WHERE task_id = $1
      `, [vod.task_id]);

      await client.query('COMMIT');

      logger.info(`Successfully completed and tracked VOD download`, {
        vod_id: vod.id,
        task_id: vod.task_id,
        twitch_id: vod.twitch_id,
        file_size: fileSizeBytes,
        download_duration: downloadDurationSeconds,
        download_speed: downloadSpeedMbps
      });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error marking download as completed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate MD5 checksum for file integrity verification
   */
  private async calculateMD5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Example of how to get task completion statistics for progress reporting
   */
  async getTaskProgress(taskId: number): Promise<any> {
    try {
      const stats = await this.completedVodService.getTaskCompletionStats(taskId);
      
      logger.info(`Task ${taskId} progress:`, {
        completion_percentage: stats.completion_percentage,
        completed_vods: stats.completed_vods,
        total_vods: stats.total_vods,
        total_size_gb: (stats.total_size_bytes / (1024 * 1024 * 1024)).toFixed(2),
        avg_speed_mbps: stats.avg_download_speed_mbps
      });
      
      return stats;
    } catch (error) {
      logger.error('Error getting task progress:', error);
      throw error;
    }
  }

  /**
   * Example of how to prevent re-downloading completed VODs
   */
  async getVodsToDownload(taskId: number): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      // Get VODs that are not yet completed for this task
      const result = await client.query(`
        SELECT v.*
        FROM vods v
        WHERE v.task_id = $1
        AND v.download_status IN ('pending', 'queued', 'failed')
        AND NOT EXISTS (
          SELECT 1 FROM completed_vods cv
          WHERE cv.twitch_id = v.twitch_id::bigint
          AND cv.task_id = v.task_id
        )
        ORDER BY v.created_at ASC
        LIMIT 50
      `, [taskId]);

      logger.info(`Found ${result.rows.length} VODs to download for task ${taskId}`);
      return result.rows;
    } catch (error) {
      logger.error('Error getting VODs to download:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * USAGE EXAMPLES:
 * 
 * 1. In the main download processing loop:
 * ```typescript
 * const vodsToDownload = await downloadHandler.getVodsToDownload(taskId);
 * 
 * for (const vod of vodsToDownload) {
 *   // Check if already completed (additional safety check)
 *   if (await downloadHandler.shouldSkipVod(vod)) {
 *     continue;
 *   }
 *   
 *   // Start download...
 *   const downloadStartTime = new Date();
 *   const finalPath = await downloadHandler.downloadVOD(vod);
 *   
 *   // Mark as completed with tracking
 *   await downloadHandler.markDownloadCompleted(vod, finalPath, downloadStartTime);
 * }
 * ```
 * 
 * 2. For progress reporting:
 * ```typescript
 * const progress = await downloadHandler.getTaskProgress(taskId);
 * console.log(`Task completion: ${progress.completion_percentage}%`);
 * ```
 * 
 * 3. For task management dashboard:
 * ```typescript
 * const allTasksStats = await completedVodService.getAllTasksCompletionStats();
 * // Display completion percentages for all tasks
 * ```
 */
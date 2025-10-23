// Filepath: backend/src/services/completedVodService.ts

import { Pool } from 'pg';
import { CompletedVOD, CompletedVODRequest, TaskCompletionStats } from '../types/database';
import { logger } from '../utils/logger';

export class CompletedVodService {
  constructor(private pool: Pool) {}

  /**
   * Mark a VOD as completed by inserting into completed_vods table
   * This automatically updates the main vods table via trigger
   */
  /**
   * Mark a VOD as completed using safe upsert function (handles concurrency)
   */
  async markVodCompleted(request: CompletedVODRequest): Promise<CompletedVOD> {
    const client = await this.pool.connect();
    try {
      // Use safe upsert function to handle duplicate key constraint violations
      await client.query(`
        SELECT upsert_completed_vod($1, $2, $3::bigint, $4, $5, $6, $7, $8, $9, $10)
      `, [
        request.vod_id,
        request.task_id,
        request.twitch_id,
        request.file_path,
        request.file_name,
        request.file_size_bytes,
        request.download_duration_seconds,
        request.download_speed_mbps,
        request.checksum_md5,
        JSON.stringify(request.metadata || {})
      ]);

      // Return the completed VOD record
      const result = await client.query(`
        SELECT * FROM completed_vods 
        WHERE twitch_id = $1::bigint AND task_id = $2
      `, [request.twitch_id, request.task_id]);

      if (result.rows.length === 0) {
        throw new Error(`Failed to retrieve completed VOD record for ${request.twitch_id}`);
      }

      logger.info(`Safely marked VOD as completed: ${request.twitch_id}`, {
        vod_id: request.vod_id,
        task_id: request.task_id,
        file_size: request.file_size_bytes
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Error marking VOD as completed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if a VOD is already completed for a specific task
   */
  /**
   * Check if a VOD is completed using direct database query
   * This bypasses the problematic stored function and uses a simple query
   */
  async isVodCompleted(twitchId: string, taskId: number): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      // Direct query to check if VOD is completed - simpler and more reliable
      const result = await client.query(
        'SELECT EXISTS(SELECT 1 FROM completed_vods WHERE twitch_id = $1::bigint AND task_id = $2) as completed',
        [twitchId, taskId]
      );
      return result.rows[0].completed;
    } catch (error) {
      logger.error('Error checking VOD completion status:', error);
      
      // If even the direct query fails, assume not completed to allow retry
      logger.warn(`Assuming VOD ${twitchId} is not completed due to database error`);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Get completion statistics for a task
   */
  async getTaskCompletionStats(taskId: number): Promise<TaskCompletionStats> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM get_task_completion_stats($1)',
        [taskId]
      );
      
      const stats = result.rows[0];
      return {
        total_vods: stats.total_vods,
        completed_vods: stats.completed_vods,
        completion_percentage: parseFloat(stats.completion_percentage),
        total_size_bytes: parseInt(stats.total_size_bytes),
        avg_download_speed_mbps: stats.avg_download_speed_mbps ? parseFloat(stats.avg_download_speed_mbps) : null,
        avg_download_duration_seconds: stats.avg_download_duration_seconds || null
      };
    } catch (error) {
      logger.error('Error getting task completion stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all completed VODs for a task
   */
  async getCompletedVodsForTask(taskId: number, limit?: number, offset?: number): Promise<CompletedVOD[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT cv.*, v.title, v.duration, c.username as channel_name
        FROM completed_vods cv
        JOIN vods v ON cv.vod_id = v.id
        JOIN channels c ON v.channel_id = c.id
        WHERE cv.task_id = $1
        ORDER BY cv.completed_at DESC
        ${limit ? `LIMIT $2` : ''}
        ${offset ? `OFFSET $${limit ? 3 : 2}` : ''}
      `;
      
      const params: any[] = [taskId];
      if (limit) params.push(limit);
      if (offset) params.push(offset);

      const result = await client.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting completed VODs for task:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get recently completed VODs across all tasks
   */
  async getRecentlyCompletedVods(limit: number = 10): Promise<CompletedVOD[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT cv.*, v.title, v.duration, c.username as channel_name, t.name as task_name
        FROM completed_vods cv
        JOIN vods v ON cv.vod_id = v.id
        JOIN channels c ON v.channel_id = c.id
        JOIN tasks t ON cv.task_id = t.id
        ORDER BY cv.completed_at DESC
        LIMIT $1
      `, [limit]);
      
      return result.rows;
    } catch (error) {
      logger.error('Error getting recently completed VODs:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get completion statistics for all tasks
   */
  async getAllTasksCompletionStats(): Promise<Array<TaskCompletionStats & { task_id: number; task_name: string }>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          t.id as task_id,
          t.name as task_name,
          stats.*
        FROM tasks t
        CROSS JOIN LATERAL get_task_completion_stats(t.id) as stats
        WHERE t.is_active = true
        ORDER BY stats.completion_percentage DESC
      `);
      
      return result.rows.map(row => ({
        task_id: row.task_id,
        task_name: row.task_name,
        total_vods: row.total_vods,
        completed_vods: row.completed_vods,
        completion_percentage: parseFloat(row.completion_percentage),
        total_size_bytes: parseInt(row.total_size_bytes),
        avg_download_speed_mbps: row.avg_download_speed_mbps ? parseFloat(row.avg_download_speed_mbps) : null,
        avg_download_duration_seconds: row.avg_download_duration_seconds || null
      }));
    } catch (error) {
      logger.error('Error getting all tasks completion stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Remove a completed VOD record (for cleanup or re-download scenarios)
   */
  async removeCompletedVod(twitchId: string, taskId: number): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM completed_vods WHERE twitch_id = $1 AND task_id = $2',
        [twitchId, taskId]
      );
      
      const deleted = (result.rowCount ?? 0) > 0;
      if (deleted) {
        logger.info(`Removed completed VOD record: ${twitchId}`, { task_id: taskId });
      }
      
      return deleted;
    } catch (error) {
      logger.error('Error removing completed VOD:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
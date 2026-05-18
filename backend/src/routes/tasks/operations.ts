// Filepath: backend/src/routes/tasks/operations.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import DownloadManager from '../../services/downloadManager';
import type { CreateTaskRequest, UpdateTaskRequest, BatchUpdateRequest } from './validation';
import type { Task } from './types';
import type {
  QueueStatus,
  SystemResources,
  DownloadMetrics
} from '../../services/downloadManager/types';

// Enum types should match database
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskManagerDetails {
  queueStatus: QueueStatus;
  systemResources: SystemResources;
  metrics: DownloadMetrics;
}

export interface TaskMonitoringStats {
  successRate: number;
  errorRate: number;
  storageUsedGB: number;
  storageLimitGB: number;
  activeDownloads: number;
  maxConcurrent: number;
  totalVods: number;
  completedVods: number;
  failedVods: number;
}

export interface TaskPerformancePoint {
  timestamp: string;
  successRate: number;
  errorRate: number;
  downloadSpeed: number;
  storageUsed: number;
  vodCount: number;
}

export interface TaskAlertItem {
  id: number;
  type: 'error' | 'warning' | 'info';
  message: string;
  details?: Record<string, any>;
  created_at: string;
  acknowledged: boolean;
}

export class TaskOperations {
  constructor(
    private pool: Pool,
    private downloadManager: DownloadManager
  ) { }

  async createTask(userId: number, data: CreateTaskRequest): Promise<Task> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create the task
      const taskResult = await client.query(
        `INSERT INTO tasks (
          user_id,
          name,
          description,
          task_type,
          channel_ids,
          game_ids,
          schedule_type,
          schedule_value,
          storage_limit_gb,
          retention_days,
          auto_delete,
          is_active,
          priority,
          quality,
          conditions,
          restrictions,
          next_run,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW(), NOW())
        RETURNING id`,
        [
          userId,
          data.name,
          data.description || '',
          data.task_type,
          data.channel_ids || [],
          data.game_ids || [],
          data.schedule_type,
          data.schedule_value,
          data.storage_limit_gb,
          data.retention_days,
          data.auto_delete || false,
          data.is_active !== undefined ? data.is_active : true,
          data.priority || 'low',
          data.quality || null,
          data.conditions || {},
          data.restrictions || {}
        ]
      );

      const taskId = taskResult.rows[0].id;

      // Create or update task monitoring - using the new trigger-based approach
      await client.query(
        `INSERT INTO task_monitoring (
          task_id,
          status,
          status_message,
          progress_percentage,
          items_total,
          items_completed,
          items_failed,
          created_at,
          updated_at
        ) VALUES ($1, 'pending', 'Task created', 0, 0, 0, 0, NOW(), NOW())`,
        [taskId]
      );

      await client.query('COMMIT');

      // Return the created task
      const newTask = await this.getTaskById(taskId, userId);
      return newTask;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating task:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getTaskById(taskId: number, userId: number): Promise<Task> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT t.*, tm.status as monitoring_status, tm.progress_percentage
         FROM tasks t
         LEFT JOIN task_monitoring tm ON t.id = tm.task_id
         WHERE t.id = $1 AND t.user_id = $2`,
        [taskId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Task not found');
      }

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async updateTask(taskId: number, userId: number, updates: UpdateTaskRequest): Promise<Task> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Handle status changes that require downloadManager
      if (updates.status === 'running') {
        logger.info(`Task ${taskId} status changed to running - starting download processing`);
        await this.downloadManager.executeTask(taskId);
        logger.info(`Task ${taskId} download processing initiated`);
      } else if (updates.status === 'pending') {
        logger.info(`Task ${taskId} status changed to pending - stopping download processing`);
        await this.downloadManager.stopProcessing();
      }

      // Build dynamic update query
      const setValues: any[] = [];
      const setClauses: string[] = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'priority' && key !== 'status' && value !== undefined) {
          setClauses.push(`${key} = $${paramCount}`);
          setValues.push(value);
          paramCount++;
        }
      }

      // Handle priority and status separately since they need type casting
      if (updates.priority) {
        setClauses.push(`priority = '${updates.priority}'::task_priority_level`);
      }
      if (updates.status) {
        setClauses.push(`status = '${updates.status}'::task_status`);
      }

      const result = await client.query(`
        UPDATE tasks
        SET ${setClauses.join(', ')},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount}
          AND user_id = $${paramCount + 1}
        RETURNING *
      `, [...setValues, taskId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Task not found or access denied');
      }

      // Update task monitoring
      if (updates.status) {
        await client.query(`
          UPDATE task_monitoring
          SET status = $1,
              status_message = $2,
              updated_at = NOW()
          WHERE task_id = $3
        `, [
          updates.status,
          `Task status changed to ${updates.status}`,
          taskId
        ]);
      }

      await client.query('COMMIT');
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async pauseTask(taskId: number, userId: number): Promise<Task> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify task exists and belongs to user
      const taskResult = await client.query(`
        SELECT *
        FROM tasks
        WHERE id = $1 AND user_id = $2
      `, [taskId, userId]);

      if (taskResult.rows.length === 0) {
        throw new Error('Task not found or access denied');
      }

      const task = taskResult.rows[0];

      // Update task status
      const updatedTask = await client.query(`
        UPDATE tasks
        SET status = 'paused'::task_status,
            is_active = false,
            last_paused_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [taskId]);

      // Update monitoring status
      await client.query(`
        UPDATE task_monitoring
        SET status = 'paused',
            status_message = 'Task paused by user',
            updated_at = NOW()
        WHERE task_id = $1
      `, [taskId]);

      // Log the pause event
      await client.query(`
        INSERT INTO task_events (
          task_id,
          event_type,
          details,
          created_at
        ) VALUES ($1, 'status_change', $2, NOW())
      `, [
        taskId,
        JSON.stringify({
          previous_status: task.status,
          new_status: 'paused',
          reason: 'user_pause',
          timestamp: new Date().toISOString()
        })
      ]);

      // If task was actually running, stop the processing and store download positions
      if (task.status === 'running') {
        // Get current download states to preserve segment positions
        const activeDownloads = this.downloadManager.getActiveDownloads();

        // Store segment positions for active downloads
        for (const [vodId, downloadState] of Array.from(activeDownloads.entries())) {
          await client.query(`
            UPDATE vods 
            SET resume_segment_index = $1,
                download_status = 'paused',
                pause_reason = 'task_paused',
                paused_at = NOW(),
                updated_at = NOW()
            WHERE id = $2 AND task_id = $3
          `, [
            downloadState.progress.segmentIndex,
            vodId,
            taskId
          ]);
        }

        await this.downloadManager.stopProcessing();
      }

      await client.query('COMMIT');

      // Get updated task with all related info
      return await this.getTaskById(taskId, userId);

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error pausing task:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async resumeTask(taskId: number, userId: number): Promise<Task> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify task exists, belongs to user, and is paused
      const taskResult = await client.query(`
        SELECT *
        FROM tasks
        WHERE id = $1 AND user_id = $2
      `, [taskId, userId]);

      if (taskResult.rows.length === 0) {
        throw new Error('Task not found or access denied');
      }

      const task = taskResult.rows[0];

      // Only paused tasks can be resumed
      if (task.status !== 'paused') {
        throw new Error('Only paused tasks can be resumed');
      }

      // Update task status to running
      const updatedTask = await client.query(`
        UPDATE tasks
        SET status = 'running'::task_status,
            is_active = true,
            last_resumed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [taskId]);

      // Resume any paused VODs for this task
      await client.query(`
        SELECT resume_task_downloads($1)
      `, [taskId]);

      // Update monitoring status
      await client.query(`
        UPDATE task_monitoring
        SET status = 'running',
            status_message = 'Task resumed by user',
            updated_at = NOW()
        WHERE task_id = $1
      `, [taskId]);

      // Log the resume event
      await client.query(`
        INSERT INTO task_events (
          task_id,
          event_type,
          details,
          created_at
        ) VALUES ($1, 'status_change', $2, NOW())
      `, [
        taskId,
        JSON.stringify({
          previous_status: 'paused',
          new_status: 'running',
          reason: 'user_resume',
          timestamp: new Date().toISOString(),
          paused_duration_seconds: task.last_paused_at ?
            Math.floor((Date.now() - new Date(task.last_paused_at).getTime()) / 1000) : 0
        })
      ]);

      await client.query('COMMIT');

      // Restart download processing
      logger.info(`Resuming task ${taskId} - restarting download processing from last position`);
      await this.downloadManager.executeTask(taskId);
      logger.info(`Task ${taskId} resume processing initiated`);

      // Get updated task with all related info
      return await this.getTaskById(taskId, userId);

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error resuming task:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async activateTask(taskId: number, userId: number): Promise<Task> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const taskResult = await client.query(`
        SELECT t.*, tm.status as monitoring_status 
        FROM tasks t
        LEFT JOIN task_monitoring tm ON t.id = tm.task_id
        WHERE t.id = $1 AND t.user_id = $2
      `, [taskId, userId]);

      if (taskResult.rows.length === 0) {
        throw new Error('Task not found or access denied');
      }

      // First update task status
      const updatedTask = await client.query(`
        UPDATE tasks
        SET status = 'running'::task_status,
            is_active = true,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [taskId]);

      // Get current completion statistics for proper initialization
      const completionStatsQuery = await client.query(`
        SELECT 
          COALESCE((SELECT COUNT(*) FROM completed_vods cv WHERE cv.task_id = $1), 0) as completed_count,
          COALESCE((SELECT COUNT(*) FROM vods v WHERE v.task_id = $1), 0) as total_count
      `, [taskId]);

      const { completed_count, total_count } = completionStatsQuery.rows[0];
      const completionPercentage = total_count > 0 ? Math.round((completed_count / total_count) * 100) : 0;
      const statusMessage = total_count > 0
        ? `Downloaded: ${completed_count}/${total_count} VODs completed`
        : 'Task started - discovering VODs';

      // Update monitoring status with accurate progress
      // The trigger will automatically remove any existing entry for this task_id
      await client.query(`
        INSERT INTO task_monitoring (
          task_id,
          status,
          status_message,
          progress_percentage,
          items_total,
          items_completed,
          items_failed,
          created_at,
          updated_at
        ) VALUES ($1, 'running', $2, $3, $4, $5, 0, NOW(), NOW())
      `, [taskId, statusMessage, completionPercentage, total_count, completed_count]);

      await client.query('COMMIT');

      logger.info(`Activating task ${taskId} - starting queued VOD downloads`);
      await this.downloadManager.executeTask(taskId, 'activate');
      logger.info(`Task ${taskId} activation initiated - queued VOD processing running in background`);

      return updatedTask.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error activating task:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteTask(taskId: number, userId: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
        [taskId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Task not found or access denied');
      }

      await client.query('COMMIT');
      return true;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async toggleTaskState(taskId: number, userId: number, active: boolean): Promise<Task> {
    const client = await this.pool.connect();
    try {
      // Use a shorter transaction to avoid deadlocks
      await client.query('BEGIN');

      // Update task state with shorter lock time
      const result = await client.query(`
        UPDATE tasks
        SET is_active = $3,
            status = CASE 
              WHEN $3 = true THEN 'running'::task_status 
              ELSE 'pending'::task_status 
            END,
            updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `, [taskId, userId, active]);

      if (result.rows.length === 0) {
        throw new Error('Task not found or access denied');
      }

      // Update monitoring status (use UPDATE or INSERT separately to avoid constraint issues)
      const monitoringExists = await client.query(`
        SELECT id FROM task_monitoring WHERE task_id = $1
      `, [taskId]);

      if (active) {
        // Get current completion statistics for activation
        const completionStatsQuery = await client.query(`
          SELECT 
            COALESCE((SELECT COUNT(*) FROM completed_vods cv WHERE cv.task_id = $1), 0) as completed_count,
            COALESCE((SELECT COUNT(*) FROM vods v WHERE v.task_id = $1), 0) as total_count
        `, [taskId]);

        const { completed_count, total_count } = completionStatsQuery.rows[0];
        const completionPercentage = total_count > 0 ? Math.round((completed_count / total_count) * 100) : 0;
        const statusMessage = total_count > 0
          ? `Downloaded: ${completed_count}/${total_count} VODs completed`
          : 'Task activated - discovering VODs';

        if (monitoringExists.rows.length > 0) {
          await client.query(`
            UPDATE task_monitoring
            SET status = 'running',
                status_message = $2,
                progress_percentage = $3,
                items_total = $4,
                items_completed = $5,
                updated_at = NOW()
            WHERE task_id = $1
          `, [taskId, statusMessage, completionPercentage, total_count, completed_count]);
        } else {
          await client.query(`
            INSERT INTO task_monitoring (
              task_id, status, status_message, progress_percentage,
              items_total, items_completed, items_failed,
              created_at, updated_at
            ) VALUES ($1, 'running', $2, $3, $4, $5, 0, NOW(), NOW())
          `, [taskId, statusMessage, completionPercentage, total_count, completed_count]);
        }
      } else {
        // Deactivating task
        if (monitoringExists.rows.length > 0) {
          await client.query(`
            UPDATE task_monitoring
            SET status = 'pending',
                status_message = 'Task deactivated',
                updated_at = NOW()
            WHERE task_id = $1
          `, [taskId]);
        } else {
          await client.query(`
            INSERT INTO task_monitoring (
              task_id, status, status_message, progress_percentage,
              items_total, items_completed, items_failed,
              created_at, updated_at
            ) VALUES ($1, 'pending', 'Task deactivated', 0, 0, 0, 0, NOW(), NOW())
          `, [taskId]);
        }
      }

      await client.query('COMMIT');

      // Start or stop task processing AFTER transaction commit
      if (active) {
        logger.info(`Activating task ${taskId} - starting VOD discovery and download processing`);
        // Note: executeTask now runs in background and returns immediately
        await this.downloadManager.executeTask(taskId);
        logger.info(`Task ${taskId} activation initiated - VOD discovery running in background`);
      } else {
        logger.info(`Deactivating task ${taskId} - stopping download processing`);
        await this.downloadManager.stopProcessing();
      }

      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK').catch(() => { }); // Ignore rollback errors
      logger.error(`Error toggling task ${taskId} state:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllTasks(userId: number) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT t.*,
               tm.status as monitoring_status,
               tm.status_message,
               tm.progress_percentage,
               tm.items_total,
               tm.items_completed,
               ts.total_vods,
               ts.successful_downloads,
               -- Get actual completion statistics from completed_vods table
               COALESCE((SELECT COUNT(*) FROM completed_vods cv WHERE cv.task_id = t.id), 0) as actual_completed_vods,
               COALESCE((SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id), 0) as total_discovered_vods,
               CASE 
                 WHEN (SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id) > 0 THEN
                   ROUND((COALESCE((SELECT COUNT(*) FROM completed_vods cv WHERE cv.task_id = t.id), 0)::numeric / 
                          (SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id)::numeric) * 100, 2)
                 ELSE 0
               END as actual_completion_percentage,
               jsonb_build_object(
                 'percentage', CASE 
                   WHEN (SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id) > 0 THEN
                     ROUND((COALESCE((SELECT COUNT(*) FROM completed_vods cv WHERE cv.task_id = t.id), 0)::numeric / 
                            (SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id)::numeric) * 100, 2)
                   ELSE COALESCE(tm.progress_percentage, 0)
                 END,
                 'status_message', CASE
                   WHEN (SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id) > 0 THEN
                     CONCAT('Downloaded: ', 
                            COALESCE((SELECT COUNT(*) FROM completed_vods cv WHERE cv.task_id = t.id), 0), 
                            '/', 
                            (SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id), 
                            ' VODs completed')
                   ELSE COALESCE(tm.status_message, 'No VODs discovered yet')
                 END,
                 'message', CASE
                   WHEN (SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id) > 0 THEN
                     CONCAT('Downloaded: ', 
                            COALESCE((SELECT COUNT(*) FROM completed_vods cv WHERE cv.task_id = t.id), 0), 
                            '/', 
                            (SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id), 
                            ' VODs completed')
                   ELSE COALESCE(tm.status_message, 'No VODs discovered yet')
                 END,
                 'current_progress', jsonb_build_object(
                   'completed', COALESCE((SELECT COUNT(*) FROM completed_vods cv WHERE cv.task_id = t.id), 0),
                   'total', COALESCE((SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id), 0)
                 )
               ) as progress
        FROM tasks t
        LEFT JOIN task_monitoring tm ON t.id = tm.task_id
        LEFT JOIN task_statistics ts ON t.id = ts.task_id
        WHERE t.user_id = $1
        ORDER BY t.updated_at DESC
      `, [userId]);

      return result.rows;
    } finally {
      client.release();
    }
  }

  async getTaskHistory(taskId: number, userId: number, limit: number = 10) {
    const client = await this.pool.connect();
    try {
      const taskExists = await client.query(
        'SELECT 1 FROM tasks WHERE id = $1 AND user_id = $2',
        [taskId, userId]
      );

      if (taskExists.rows.length === 0) {
        throw new Error('Task not found or access denied');
      }

      const result = await client.query(`
        SELECT h.*, 
               jsonb_agg(e.details) as events
        FROM task_history h
        LEFT JOIN task_events e ON e.task_id = h.task_id
        WHERE h.task_id = $1
        GROUP BY h.id
        ORDER BY h.created_at DESC
        LIMIT $2
      `, [taskId, limit]);

      return result.rows;
    } finally {
      client.release();
    }
  }

  async getTaskManagerDetails(): Promise<TaskManagerDetails> {
    return {
      queueStatus: await this.downloadManager.getQueueStatus(),
      systemResources: await this.downloadManager.getSystemResources(),
      metrics: this.downloadManager.getMetrics()
    };
  }

  async getTaskMonitoringStats(taskId: number, userId: number): Promise<TaskMonitoringStats> {
    const snapshot = await this.getTaskMonitoringSnapshot(taskId, userId);

    return {
      successRate: snapshot.totalVods > 0
        ? Number(((snapshot.completedVods / snapshot.totalVods) * 100).toFixed(2))
        : 0,
      errorRate: snapshot.totalVods > 0
        ? Number(((snapshot.failedVods / snapshot.totalVods) * 100).toFixed(2))
        : 0,
      storageUsedGB: Number((snapshot.storageUsedBytes / (1024 * 1024 * 1024)).toFixed(2)),
      storageLimitGB: snapshot.storageLimitGb,
      activeDownloads: snapshot.activeDownloads,
      maxConcurrent: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3', 10),
      totalVods: snapshot.totalVods,
      completedVods: snapshot.completedVods,
      failedVods: snapshot.failedVods,
    };
  }

  async getTaskPerformanceHistory(
    taskId: number,
    userId: number,
    timeRange: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<TaskPerformancePoint[]> {
    const client = await this.pool.connect();
    try {
      const rangeMap: Record<'hour' | 'day' | 'week' | 'month', string> = {
        hour: '1 hour',
        day: '1 day',
        week: '1 week',
        month: '1 month',
      };

      const taskExists = await client.query(
        'SELECT 1 FROM tasks WHERE id = $1 AND user_id = $2',
        [taskId, userId]
      );

      if (taskExists.rows.length === 0) {
        throw new Error('Task not found or access denied');
      }

      const result = await client.query(`
        SELECT
          tpm.measured_at as timestamp,
          tpm.success_rate,
          tpm.failure_rate,
          tpm.avg_download_speed,
          tpm.storage_used,
          tpm.vod_count
        FROM task_performance_metrics tpm
        JOIN tasks t ON tpm.task_id = t.id
        WHERE tpm.task_id = $1
          AND t.user_id = $2
          AND tpm.measured_at >= NOW() - $3::interval
        ORDER BY tpm.measured_at ASC
      `, [taskId, userId, rangeMap[timeRange]]);

      if (result.rows.length > 0) {
        return result.rows.map((row) => ({
          timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : new Date(row.timestamp).toISOString(),
          successRate: Number(row.success_rate) || 0,
          errorRate: Number(row.failure_rate) || 0,
          downloadSpeed: Number(row.avg_download_speed) || 0,
          storageUsed: Number(row.storage_used) || 0,
          vodCount: Number(row.vod_count) || 0,
        }));
      }

      const stats = await this.getTaskMonitoringStats(taskId, userId);
      return [{
        timestamp: new Date().toISOString(),
        successRate: stats.successRate,
        errorRate: stats.errorRate,
        downloadSpeed: 0,
        storageUsed: stats.storageUsedGB,
        vodCount: stats.totalVods,
      }];
    } finally {
      client.release();
    }
  }

  async getTaskAlerts(taskId: number, userId: number): Promise<TaskAlertItem[]> {
    const snapshot = await this.getTaskMonitoringSnapshot(taskId, userId);
    const task = await this.getTaskById(taskId, userId);
    const thresholds = this.normalizeAlertThresholds((task as any).alert_thresholds);
    const stats = await this.getTaskMonitoringStats(taskId, userId);
    const alerts: TaskAlertItem[] = [];
    let nextId = 1;

    if (task.status === 'failed') {
      alerts.push({
        id: nextId++,
        type: 'error',
        message: 'Task is currently in a failed state.',
        details: { status: task.status },
        created_at: new Date().toISOString(),
        acknowledged: false,
      });
    }

    if (stats.errorRate >= thresholds.errorRate || stats.failedVods >= thresholds.warningThreshold) {
      alerts.push({
        id: nextId++,
        type: stats.errorRate >= thresholds.criticalThreshold ? 'error' : 'warning',
        message: `${stats.failedVods} VODs have failed for this task.`,
        details: {
          errorRate: stats.errorRate,
          failedVods: stats.failedVods,
          threshold: thresholds.errorRate,
        },
        created_at: new Date().toISOString(),
        acknowledged: false,
      });
    }

    if (stats.storageLimitGB > 0) {
      const storageUsage = (stats.storageUsedGB / stats.storageLimitGB) * 100;
      if (storageUsage >= thresholds.storageUsage) {
        alerts.push({
          id: nextId++,
          type: 'warning',
          message: `Storage usage is at ${storageUsage.toFixed(1)}% of the task limit.`,
          details: {
            storageUsedGB: stats.storageUsedGB,
            storageLimitGB: stats.storageLimitGB,
            threshold: thresholds.storageUsage,
          },
          created_at: new Date().toISOString(),
          acknowledged: false,
        });
      }
    }

    if (snapshot.activeDownloads === 0 && task.status === 'running' && snapshot.totalVods > 0 && snapshot.completedVods < snapshot.totalVods) {
      alerts.push({
        id: nextId++,
        type: 'info',
        message: 'Task is active but there are no downloads currently in progress.',
        details: {
          monitoringStatus: (task as any).monitoring_status,
        },
        created_at: new Date().toISOString(),
        acknowledged: false,
      });
    }

    return alerts;
  }

  async batchUpdateTasks(userId: number, { task_ids, updates }: BatchUpdateRequest): Promise<Task[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify all tasks belong to user
      const taskCheck = await client.query(`
        SELECT COUNT(*) as count
        FROM tasks
        WHERE id = ANY($1)
          AND user_id = $2
      `, [task_ids, userId]);

      if (taskCheck.rows[0].count !== task_ids.length) {
        throw new Error('One or more tasks not found or access denied');
      }

      // Handle status changes if needed
      if (updates.status === 'running') {
        await Promise.all(task_ids.map(taskId =>
          this.downloadManager.executeTask(taskId)
        ));
      }

      // Build dynamic update query
      const setValues: any[] = [];
      const setClauses: string[] = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'priority' && key !== 'status' && value !== undefined) {
          setClauses.push(`${key} = $${paramCount}`);
          setValues.push(value);
          paramCount++;
        }
      }

      // Handle priority separately since it needs type casting
      const priorityClause = updates.priority ?
        `, priority = '${updates.priority}'::task_priority_level` : '';

      const result = await client.query(`
        UPDATE tasks
        SET ${setClauses.join(', ')}${priorityClause},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($${paramCount})
          AND user_id = $${paramCount + 1}
        RETURNING *
      `, [...setValues, task_ids, userId]);

      await client.query('COMMIT');
      return Promise.all(result.rows.map(task =>
        this.downloadManager.getTaskDetails(task.id)
      ));

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async batchDeleteTasks(userId: number, taskIds: number[]): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'DELETE FROM tasks WHERE id = ANY($1) AND user_id = $2 RETURNING id',
        [taskIds, userId]
      );

      if (result.rows.length !== taskIds.length) {
        throw new Error('One or more tasks not found or access denied');
      }

      await client.query('COMMIT');
      return true;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async getTaskMonitoringSnapshot(taskId: number, userId: number) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT
          t.id,
          COALESCE(t.storage_limit_gb, 0) as storage_limit_gb,
          COUNT(v.id)::INTEGER as total_vods,
          COUNT(*) FILTER (WHERE v.download_status = 'completed')::INTEGER as completed_vods,
          COUNT(*) FILTER (WHERE v.download_status = 'failed')::INTEGER as failed_vods,
          COUNT(*) FILTER (WHERE v.download_status IN ('queued', 'downloading'))::INTEGER as active_downloads,
          COALESCE(
            SUM(
              CASE
                WHEN v.download_status = 'completed' THEN COALESCE(cv.file_size_bytes, v.file_size, 0)
                ELSE 0
              END
            ),
            0
          )::BIGINT as storage_used_bytes
        FROM tasks t
        LEFT JOIN vods v ON v.task_id = t.id
        LEFT JOIN completed_vods cv ON cv.vod_id = v.id
        WHERE t.id = $1 AND t.user_id = $2
        GROUP BY t.id, t.storage_limit_gb
      `, [taskId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Task not found or access denied');
      }

      const row = result.rows[0];
      return {
        storageLimitGb: Number(row.storage_limit_gb) || 0,
        totalVods: Number(row.total_vods) || 0,
        completedVods: Number(row.completed_vods) || 0,
        failedVods: Number(row.failed_vods) || 0,
        activeDownloads: Number(row.active_downloads) || 0,
        storageUsedBytes: Number(row.storage_used_bytes) || 0,
      };
    } finally {
      client.release();
    }
  }

  private normalizeAlertThresholds(raw: any) {
    return {
      errorRate: Number(raw?.errorRate) || 20,
      storageUsage: Number(raw?.storageUsage) || 85,
      warningThreshold: Number(raw?.warningThreshold) || 5,
      criticalThreshold: Number(raw?.criticalThreshold) || 10,
    };
  }
}

export const createTaskOperations = (pool: Pool, downloadManager: DownloadManager) =>
  new TaskOperations(pool, downloadManager);

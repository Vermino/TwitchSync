// Filepath: backend/src/routes/tasks/operations.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import DownloadManager from '../../services/downloadManager';
import type { Task, CreateTaskRequest, UpdateTaskRequest, BatchUpdateRequest } from './validation';
import type {
  QueueStatus,
  SystemResources,
  DownloadMetrics
} from '../../services/downloadManager/types';

// Enum types should match database
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskManagerDetails {
  queueStatus: QueueStatus;
  systemResources: SystemResources;
  metrics: DownloadMetrics;
}

export class TaskOperations {
  constructor(
    private pool: Pool,
    private downloadManager: DownloadManager
  ) {}

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
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
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
          data.is_active || true,
          data.priority || 'low'
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

  async updateTask(taskId: number, userId: number, updates: UpdateTaskRequest) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Handle status changes that require downloadManager
      if (updates.status === 'running') {
        await this.downloadManager.executeTask(taskId);
      } else if (updates.status === 'pending') {
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

      // If task was actually running, stop the processing
      if (task.status === 'running') {
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

      // Update monitoring status
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
        ) VALUES ($1, 'running', 'Task started', 0, 0, 0, 0, NOW(), NOW())
        ON CONFLICT (task_id) 
        DO UPDATE SET 
          status = 'running',
          status_message = 'Task started',
          progress_percentage = 0,
          updated_at = NOW()
      `, [taskId]);

      // Start the download manager processing
      await this.downloadManager.executeTask(taskId);

      await client.query('COMMIT');

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
      await client.query('BEGIN');

      // Update task state
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

      // Start or stop task processing
      if (active) {
        await this.downloadManager.executeTask(taskId);
      } else {
        await this.downloadManager.stopProcessing();
      }

      // Update monitoring status
      await client.query(`
        UPDATE task_monitoring
        SET status = $2,
            status_message = $3,
            updated_at = NOW()
        WHERE task_id = $1
      `, [
        taskId,
        active ? 'running' : 'pending',
        active ? 'Task activated' : 'Task deactivated'
      ]);

      await client.query('COMMIT');
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
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
               jsonb_build_object(
                 'percentage', COALESCE(tm.progress_percentage, 0),
                 'message', tm.status_message,
                 'current_progress', jsonb_build_object(
                   'completed', COALESCE(tm.items_completed, 0),
                   'total', COALESCE(tm.items_total, 0)
                 )
               ) as progress
        FROM tasks t
        LEFT JOIN task_monitoring tm ON t.id = tm.task_id
        LEFT JOIN task_statistics ts ON t.id = ts.task_id
        WHERE t.user_id = $1
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

  async batchUpdateTasks(userId: number, { task_ids, updates }: BatchUpdateRequest) {
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
}

export const createTaskOperations = (pool: Pool, downloadManager: DownloadManager) =>
  new TaskOperations(pool, downloadManager);

// Filepath: backend/src/routes/tasks/controller.ts

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import DownloadManager from '../../services/downloadManager';
import { Task, CreateTaskSchema, UpdateTaskRequest } from './validation';

export class TasksController {
  constructor(private pool: Pool, private downloadManager: DownloadManager) {
    // Bind methods to preserve 'this' context
    this.getAllTasks = this.getAllTasks.bind(this);
    this.getTaskById = this.getTaskById.bind(this);
    this.createTask = this.createTask.bind(this);
    this.updateTask = this.updateTask.bind(this);
    this.deleteTask = this.deleteTask.bind(this);
    this.getTaskHistory = this.getTaskHistory.bind(this);
    this.getTaskDetails = this.getTaskDetails.bind(this);
    this.manualRunTask = this.manualRunTask.bind(this);
    this.batchUpdateTasks = this.batchUpdateTasks.bind(this);
    this.batchDeleteTasks = this.batchDeleteTasks.bind(this);
  }

  async getAllTasks(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Updated query to properly join with task_monitoring
      const result = await client.query(`
        WITH latest_monitoring AS (
          SELECT DISTINCT ON (task_id)
            task_id,
            status as monitoring_status,
            status_message,
            progress_percentage,
            items_total,
            items_completed,
            items_failed,
            created_at,
            updated_at
          FROM task_monitoring
          ORDER BY task_id, created_at DESC
        )
        SELECT 
          t.*,
          tm.monitoring_status,
          tm.status_message,
          tm.progress_percentage,
          tm.items_total,
          tm.items_completed,
          COALESCE(
            jsonb_build_object(
              'percentage', COALESCE(tm.progress_percentage, 0),
              'status_message', tm.status_message,
              'current_progress', jsonb_build_object(
                'completed', COALESCE(tm.items_completed, 0),
                'total', COALESCE(tm.items_total, 0)
              )
            ),
            jsonb_build_object(
              'percentage', 0,
              'status_message', null,
              'current_progress', null
            )
          ) as progress,
          (
            SELECT COUNT(*)
            FROM vods v
            WHERE v.task_id = t.id
          ) as total_vods,
          (
            SELECT COUNT(*)
            FROM vods v
            WHERE v.task_id = t.id AND v.status = 'completed'
          ) as completed_vods
        FROM tasks t
        LEFT JOIN latest_monitoring tm ON t.id = tm.task_id
        WHERE t.user_id = $1
        ORDER BY t.created_at DESC
      `, [userId]);

      // Log the results for debugging
      logger.debug('Tasks fetched:', {
        count: result.rows.length,
        tasks: result.rows.map(t => ({
          id: t.id,
          name: t.name,
          status: t.status,
          progress: t.progress
        }))
      });

      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching tasks:', error);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    } finally {
      client.release();
    }
  }

  async getTaskById(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await client.query<Task>(`
        SELECT 
          t.*,
          COUNT(th.id) as total_runs,
          COUNT(CASE WHEN th.status = 'success' THEN 1 END) as successful_runs,
          MAX(th.end_time) as last_completed,
          (
            SELECT COUNT(*)
            FROM vods v
            WHERE v.task_id = t.id
          ) as total_vods,
          (
            SELECT COUNT(*)
            FROM vods v
            WHERE v.task_id = t.id AND v.status = 'completed'
          ) as completed_vods,
          tm.status as monitoring_status,
          tm.status_message,
          tm.progress_percentage,
          COALESCE(
            jsonb_build_object(
              'percentage', COALESCE(tm.progress_percentage, 0),
              'message', tm.status_message,
              'status', tm.status
            ),
            jsonb_build_object(
              'percentage', 0,
              'message', null,
              'status', 'created'
            )
          ) as progress
        FROM tasks t
        LEFT JOIN task_history th ON t.id = th.task_id
        LEFT JOIN task_monitoring tm ON t.id = tm.task_id
        WHERE t.user_id = $1
        GROUP BY t.id, tm.id
        ORDER BY t.created_at DESC
      `, [userId]);

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error fetching task:', error);
      res.status(500).json({ error: 'Failed to fetch task' });
    } finally {
      client.release();
    }
  }

  async createTask(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const taskData = req.body;

      await client.query('BEGIN');

      try {
        // Insert task
        const dbResult = await client.query(`
          INSERT INTO tasks (
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
            user_id,
            status,
            conditions,
            restrictions,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::task_priority_level, $13, 'pending', $14, $15, NOW(), NOW())
          RETURNING id
        `, [
          taskData.name,
          taskData.description,
          taskData.task_type,
          taskData.channel_ids,
          taskData.game_ids,
          taskData.schedule_type,
          taskData.schedule_value,
          taskData.storage_limit_gb,
          taskData.retention_days,
          taskData.auto_delete || false,
          taskData.is_active,
          taskData.priority || 'normal',
          userId,
          taskData.conditions || {},
          taskData.restrictions || {}
        ]);

        const taskId = dbResult.rows[0].id;

        // Initialize task monitoring record
        const monitoringResult = await client.query(`
          INSERT INTO task_monitoring (
            task_id,
            status,
            status_message,
            progress_percentage,
            items_total,
            items_completed,
            items_failed,
            created_at,
            updated_at,
            metadata
          )
          VALUES ($1, 'pending', 'Task created and pending execution', 0, 0, 0, 0, NOW(), NOW(), '{}')
          ON CONFLICT (task_id) 
          DO UPDATE SET
            status = EXCLUDED.status,
            status_message = EXCLUDED.status_message,
            updated_at = NOW()
          RETURNING *
        `, [taskId]);

        await client.query('COMMIT');

        // Fetch complete task data
        const taskResult = await client.query(`
          SELECT 
            t.*,
            tm.status as monitoring_status,
            tm.status_message,
            tm.progress_percentage,
            tm.items_total,
            tm.items_completed,
            jsonb_build_object(
              'percentage', COALESCE(tm.progress_percentage, 0),
              'status_message', tm.status_message,
              'current_progress', jsonb_build_object(
                'completed', COALESCE(tm.items_completed, 0),
                'total', COALESCE(tm.items_total, 0)
              )
            ) as progress
          FROM tasks t
          LEFT JOIN task_monitoring tm ON t.id = tm.task_id
          WHERE t.id = $1
        `, [taskId]);

        logger.info('Task created successfully', {
          taskId,
          taskType: taskData.task_type,
          monitoringId: monitoringResult.rows[0].id,
          taskData: taskResult.rows[0]
        });

        res.status(201).json(taskResult.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error creating task:', error);
      res.status(500).json({ error: 'Failed to create task' });
    } finally {
      client.release();
    }
  }

  async updateTask(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Check if task exists and belongs to user
      const taskCheck = await client.query(
        'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
        [taskId, userId]
      );

      if (taskCheck.rows.length === 0) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      await client.query('BEGIN');

      try {
        const updates = req.body;

        // Build dynamic update query
        const setValues: any[] = [];
        const setClauses: string[] = [];
        let paramCount = 1;

        for (const [key, value] of Object.entries(updates)) {
          if (key !== 'priority' && value !== undefined) {
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
          WHERE id = $${paramCount}
            AND user_id = $${paramCount + 1}
          RETURNING *
        `, [...setValues, taskId, userId]);

        // Update task monitoring if status changed
        if (updates.status) {
          await client.query(`
            INSERT INTO task_monitoring (
              task_id,
              status_message,
              progress_percentage,
              created_at
            )
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          `, [
            taskId,
            `Task status changed to ${updates.status}`,
            updates.status === 'completed' ? 100 : 0
          ]);
        }

        await client.query('COMMIT');
        res.json(result.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error updating task:', error);
      res.status(500).json({ error: 'Failed to update task' });
    } finally {
      client.release();
    }
  }

  async deleteTask(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      logger.debug(`Starting deletion of task ${taskId} for user ${userId}`);

      await client.query('BEGIN');

      // First verify the task exists and belongs to the user
      const taskCheck = await client.query(
        'SELECT id FROM tasks WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [taskId, userId]
      );

      if (taskCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        logger.debug(`Task ${taskId} not found or doesn't belong to user ${userId}`);
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      try {
        // Delete task history first
        logger.debug(`Deleting task history for task ${taskId}`);
        await client.query(
          'DELETE FROM task_history WHERE task_id = $1',
          [taskId]
        );

        // Delete task monitoring records
        logger.debug(`Deleting task monitoring records for task ${taskId}`);
        await client.query(
          'DELETE FROM task_monitoring WHERE task_id = $1',
          [taskId]
        );

        // Delete VOD segments
        logger.debug(`Deleting VOD segments for task ${taskId}`);
        await client.query(`
          DELETE FROM vod_segments 
          WHERE vod_id IN (SELECT id FROM vods WHERE task_id = $1)
        `, [taskId]);

        // Delete VODs associated with the task
        logger.debug(`Deleting VODs for task ${taskId}`);
        await client.query(
          'DELETE FROM vods WHERE task_id = $1',
          [taskId]
        );

        // Finally delete the task
        logger.debug(`Deleting task ${taskId}`);
        await client.query(
          'DELETE FROM tasks WHERE id = $1 AND user_id = $2',
          [taskId, userId]
        );

        await client.query('COMMIT');
        logger.info(`Successfully deleted task ${taskId} and all related data`);
        res.json({ message: 'Task deleted successfully' });
      } catch (error) {
        logger.error('Error during deletion transaction:', error);
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error deleting task:', error);
      res.status(500).json({
        error: 'Failed to delete task',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      client.release();
    }
  }

  async getTaskHistory(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Verify task belongs to user
      const taskCheck = await client.query(
        'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
        [taskId, userId]
      );

      if (taskCheck.rows.length === 0) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const result = await client.query(`
        SELECT th.*,
          (
            SELECT jsonb_agg(jsonb_build_object(
              'timestamp', tm.created_at,
              'message', tm.status_message,
              'percentage', tm.progress_percentage
            ) ORDER BY tm.created_at)
            FROM task_monitoring tm
            WHERE tm.task_id = th.task_id
              AND tm.created_at BETWEEN th.start_time AND COALESCE(th.end_time, CURRENT_TIMESTAMP)
          ) as progress_updates
        FROM task_history th
        WHERE th.task_id = $1
        ORDER BY th.created_at DESC
        LIMIT $2
      `, [taskId, limit]);

      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching task history:', error);
      res.status(500).json({ error: 'Failed to fetch task history' });
    } finally {
      client.release();
    }
  }

  async getTaskDetails(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Verify task exists and belongs to user
      const taskCheck = await client.query(
        'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
        [taskId, userId]
      );

      if (taskCheck.rows.length === 0) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const result = await client.query(`
        SELECT
          t.*,
          (
            SELECT jsonb_build_object(
              'percentage', COALESCE(tm.progress_percentage, 0),
              'message', tm.status_message,
              'updated_at', tm.created_at
            )
            FROM task_monitoring tm
            WHERE tm.task_id = t.id
            ORDER BY tm.created_at DESC
            LIMIT 1
          ) as current_progress,
          (
            SELECT jsonb_build_object(
              'total_vods', COUNT(v.id),
              'completed_vods', COUNT(*) FILTER (WHERE v.status = 'completed'),
              'failed_vods', COUNT(*) FILTER (WHERE v.status = 'failed'),
              'total_size', SUM(
                CASE 
                  WHEN v.status = 'completed' 
                  THEN COALESCE((
                    SELECT SUM(vs.file_size)
                    FROM vod_segments vs
                    WHERE vs.vod_id = v.id
                  ), 0)
                  ELSE 0
                END
              )
            )
            FROM vods v
            WHERE v.task_id = t.id
          ) as vod_stats,
          (
            SELECT jsonb_build_object(
              'total_runs', COUNT(*),
              'successful_runs', COUNT(*) FILTER (WHERE status = 'success'),
              'failed_runs', COUNT(*) FILTER (WHERE status = 'failed'),
              'average_duration', 
                EXTRACT(EPOCH FROM AVG(end_time - start_time)) 
                FILTER (WHERE status = 'success' AND end_time IS NOT NULL)
            )
            FROM task_history th
            WHERE th.task_id = t.id
          ) as execution_stats
        FROM tasks t
        WHERE t.id = $1
      `, [taskId]);

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      // Get task details from download manager
      const managerDetails = await this.downloadManager.getTaskDetails(taskId);

      const response = {
        ...result.rows[0],
        ...managerDetails
      };

      res.json(response);
    } catch (error) {
      logger.error('Error fetching task details:', error);
      res.status(500).json({ error: 'Failed to fetch task details' });
    } finally {
      client.release();
    }
  }

  async manualRunTask(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Verify task exists and belongs to user
      const taskCheck = await client.query(
        'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
        [taskId, userId]
      );

      if (taskCheck.rows.length === 0) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      await client.query('BEGIN');

      try {
        // Create task history entry
        await client.query(`
          INSERT INTO task_history (
            task_id,
            status,
            start_time,
            details
          )
          VALUES ($1, 'running', CURRENT_TIMESTAMP, $2)
        `, [taskId, { trigger: 'manual', triggered_by: userId }]);

        // Update task status and monitoring
        await client.query(`
          UPDATE tasks
          SET status = 'running',
              last_run = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [taskId]);

        await client.query(`
          INSERT INTO task_monitoring (
            task_id,
            status_message,
            progress_percentage,
            created_at
          )
          VALUES ($1, 'Task started manually', 0, CURRENT_TIMESTAMP)
        `, [taskId]);

        await client.query('COMMIT');

        // Execute task asynchronously
        this.downloadManager.executeTask(taskId).catch((error: Error) => {
          logger.error(`Error during task execution:`, error);
        });

        res.json({
          message: 'Task execution started',
          taskId: taskId,
          status: 'running'
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error running task:', error);
      res.status(500).json({ error: 'Failed to run task' });
    } finally {
      client.release();
    }
  }

  async batchUpdateTasks(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const { task_ids, updates } = req.body;

      if (!Array.isArray(task_ids) || task_ids.length === 0) {
        res.status(400).json({ error: 'No task IDs provided' });
        return;
      }

      await client.query('BEGIN');

      try {
        // Verify all tasks belong to user
        const taskCheck = await client.query(`
          SELECT COUNT(*) as count
          FROM tasks
          WHERE id = ANY($1) AND user_id = $2
        `, [task_ids, userId]);

        if (taskCheck.rows[0].count !== task_ids.length) {
          throw new Error('One or more tasks not found or access denied');
        }

        // Build dynamic update query
        const setValues: any[] = [];
        const setClauses: string[] = [];
        let paramCount = 1;

        for (const [key, value] of Object.entries(updates)) {
          if (key !== 'priority' && value !== undefined) {
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

        // Add monitoring entries if status changed
        if (updates.status) {
          await Promise.all(task_ids.map(taskId =>
            client.query(`
              INSERT INTO task_monitoring (
                task_id,
                status_message,
                progress_percentage,
                created_at
              )
              VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            `, [
              taskId,
              `Task status changed to ${updates.status}`,
              updates.status === 'completed' ? 100 : 0
            ])
          ));
        }

        await client.query('COMMIT');
        res.json(result.rows);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error updating tasks:', error);
      res.status(500).json({ error: 'Failed to update tasks' });
    } finally {
      client.release();
    }
  }

  async batchDeleteTasks(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const { task_ids } = req.body;

      if (!Array.isArray(task_ids) || task_ids.length === 0) {
        res.status(400).json({ error: 'No task IDs provided' });
        return;
      }

      await client.query('BEGIN');

      try {
        // Verify all tasks belong to user
        const taskCheck = await client.query(`
          SELECT COUNT(*) as count
          FROM tasks
          WHERE id = ANY($1) AND user_id = $2
        `, [task_ids, userId]);

        if (taskCheck.rows[0].count !== task_ids.length) {
          throw new Error('One or more tasks not found or access denied');
        }

        // Delete task history
        await client.query(
          'DELETE FROM task_history WHERE task_id = ANY($1)',
          [task_ids]
        );

        // Delete task monitoring records
        await client.query(
          'DELETE FROM task_monitoring WHERE task_id = ANY($1)',
          [task_ids]
        );

        // Delete VOD segments
        await client.query(`
          DELETE FROM vod_segments 
          WHERE vod_id IN (
            SELECT id FROM vods WHERE task_id = ANY($1)
          )
        `, [task_ids]);

        // Delete VODs
        await client.query(
          'DELETE FROM vods WHERE task_id = ANY($1)',
          [task_ids]
        );

        // Delete tasks
        await client.query(
          'DELETE FROM tasks WHERE id = ANY($1) AND user_id = $2',
          [task_ids, userId]
        );

        await client.query('COMMIT');
        res.json({ message: 'Tasks deleted successfully' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error deleting tasks:', error);
      res.status(500).json({ error: 'Failed to delete tasks' });
    } finally {
      client.release();
    }
  }
}

export const createTasksController = (pool: Pool, downloadManager: DownloadManager) =>
  new TasksController(pool, downloadManager);

export default TasksController;

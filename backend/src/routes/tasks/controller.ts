// backend/src/routes/tasks/controller.ts

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { Task, CreateTaskDTO } from '../../types/database';
import { parseExpression } from 'cron-parser';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    twitch_id?: string;
  };
}

export class TasksController {
  constructor(private pool: Pool) {
    // Bind all methods to preserve 'this' context
    this.getAllTasks = this.getAllTasks.bind(this);
    this.getTaskById = this.getTaskById.bind(this);
    this.createTask = this.createTask.bind(this);
    this.updateTask = this.updateTask.bind(this);
    this.deleteTask = this.deleteTask.bind(this);
    this.getTaskHistory = this.getTaskHistory.bind(this);
    this.manualRunTask = this.manualRunTask.bind(this);
  }

  async getAllTasks(req: AuthenticatedRequest, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await client.query<Task>(`
        SELECT t.*,
               COUNT(th.id) as total_runs,
               COUNT(CASE WHEN th.status = 'success' THEN 1 END) as successful_runs,
               MAX(th.end_time) as last_completed
        FROM tasks t
        LEFT JOIN task_history th ON t.id = th.task_id
        WHERE t.user_id = $1
        GROUP BY t.id
        ORDER BY t.created_at DESC
      `, [userId]);

      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching tasks:', error);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    } finally {
      client.release();
    }
  }

  async getTaskById(req: AuthenticatedRequest, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await client.query<Task>(`
        SELECT t.*,
               COUNT(th.id) as total_runs,
               COUNT(CASE WHEN th.status = 'success' THEN 1 END) as successful_runs,
               MAX(th.end_time) as last_completed
        FROM tasks t
        LEFT JOIN task_history th ON t.id = th.task_id
        WHERE t.id = $1 AND t.user_id = $2
        GROUP BY t.id
      `, [taskId, userId]);

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

  async createTask(req: AuthenticatedRequest, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const taskData: CreateTaskDTO = {
        ...req.body,
        user_id: userId
      };

      // Validate schedule value based on type
      if (taskData.schedule_type === 'cron') {
        try {
          parseExpression(taskData.schedule_value);
        } catch (error) {
          res.status(400).json({ error: 'Invalid cron expression' });
          return;
        }
      } else if (taskData.schedule_type === 'interval') {
        const interval = parseInt(taskData.schedule_value);
        if (isNaN(interval) || interval < 60) {
          res.status(400).json({ error: 'Invalid interval. Must be at least 60 seconds.' });
          return;
        }
      }

      const result = await client.query<Task>(`
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
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
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
        taskData.auto_delete,
        taskData.is_active,
        taskData.priority,
        taskData.user_id,
        'pending'
      ]);

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Error creating task:', error);
      res.status(500).json({ error: 'Failed to create task' });
    } finally {
      client.release();
    }
  }

  async updateTask(req: AuthenticatedRequest, res: Response) {
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

      const updates = req.body;

      // Validate schedule if being updated
      if (updates.schedule_type && updates.schedule_value) {
        if (updates.schedule_type === 'cron') {
          try {
            parseExpression(updates.schedule_value);
          } catch (error) {
            res.status(400).json({ error: 'Invalid cron expression' });
            return;
          }
        } else if (updates.schedule_type === 'interval') {
          const interval = parseInt(updates.schedule_value);
          if (isNaN(interval) || interval < 60) {
            res.status(400).json({ error: 'Invalid interval. Must be at least 60 seconds.' });
            return;
          }
        }
      }

      // Build dynamic update query
      const setClause = Object.entries(updates)
        .map(([key, _], index) => `${key} = $${index + 3}`)
        .join(', ');

      const result = await client.query<Task>(`
        UPDATE tasks 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `, [taskId, userId, ...Object.values(updates)]);

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error updating task:', error);
      res.status(500).json({ error: 'Failed to update task' });
    } finally {
      client.release();
    }
  }

  async deleteTask(req: AuthenticatedRequest, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await client.query(
        'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
        [taskId, userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      res.json({ message: 'Task deleted successfully' });
    } catch (error) {
      logger.error('Error deleting task:', error);
      res.status(500).json({ error: 'Failed to delete task' });
    } finally {
      client.release();
    }
  }

  async getTaskHistory(req: AuthenticatedRequest, res: Response) {
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
        SELECT *
        FROM task_history
        WHERE task_id = $1
        ORDER BY created_at DESC
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

  async manualRunTask(req: AuthenticatedRequest, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Verify task exists and belongs to user
      const taskCheck = await client.query<Task>(
        'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
        [taskId, userId]
      );

      if (taskCheck.rows.length === 0) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      await client.query('BEGIN');

      // Create task history entry
      await client.query(`
        INSERT INTO task_history (
          task_id,
          status,
          start_time,
          details
        ) VALUES ($1, 'running', CURRENT_TIMESTAMP, $2)
      `, [taskId, { trigger: 'manual', triggered_by: userId }]);

      // Update task status
      await client.query(`
        UPDATE tasks 
        SET status = 'running',
            last_run = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [taskId]);

      await client.query('COMMIT');

      // Note: You would typically trigger the actual task execution here
      // For now, we just return success

      res.json({
        message: 'Task execution started',
        taskId: taskId,
        status: 'running'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error running task:', error);
      res.status(500).json({ error: 'Failed to run task' });
    } finally {
      client.release();
    }
  }
}

export const createTasksController = (pool: Pool) => new TasksController(pool);

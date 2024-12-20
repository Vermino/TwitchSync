// Filepath: backend/src/routes/tasks/controller.ts

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import DownloadManager from '../../services/downloadManager';
import { Task, CreateTaskSchema, UpdateTaskRequest, TaskDetails } from './validation';

export class TasksController {
  constructor(private pool: Pool, private downloadManager: DownloadManager) {
    // Bind all methods to preserve 'this' context
    this.getAllTasks = this.getAllTasks.bind(this);
    this.getTaskById = this.getTaskById.bind(this);
    this.createTask = this.createTask.bind(this);
    this.updateTask = this.updateTask.bind(this);
    this.deleteTask = this.deleteTask.bind(this);
    this.getTaskHistory = this.getTaskHistory.bind(this);
    this.getTaskDetails = this.getTaskDetails.bind(this);
    this.manualRunTask = this.manualRunTask.bind(this);
  }

  async getAllTasks(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await client.query<Task>(`
        SELECT t.*,
               COUNT(th.id)                                      as total_runs,
               COUNT(CASE WHEN th.status = 'success' THEN 1 END) as successful_runs,
               MAX(th.end_time)                                  as last_completed
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

  async getTaskById(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await client.query(`
        SELECT t.*,
               COUNT(th.id)                                      as total_runs,
               COUNT(CASE WHEN th.status = 'success' THEN 1 END) as successful_runs,
               MAX(th.end_time)                                  as last_completed
        FROM tasks t
               LEFT JOIN task_history th ON t.id = th.task_id
        WHERE t.id = $1
          AND t.user_id = $2
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

  async createTask(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await CreateTaskSchema.safeParseAsync(req);
      if (!result.success) {
        res.status(400).json({ error: 'Invalid task data', details: result.error });
        return;
      }

      const taskData = {
        ...result.data.body,
        user_id: userId
      };

      // Generate default name if not provided
      if (!taskData.name) {
        const typeLabel = taskData.task_type === 'combined' ? 'Combined' :
            taskData.task_type === 'channel' ? 'Channel' : 'Game';
        const itemCount = taskData.channel_ids.length + taskData.game_ids.length;
        const scheduleLabel = taskData.schedule_type === 'interval' ?
            `Every ${parseInt(taskData.schedule_value) / 3600} hours` :
            'Custom schedule';
        taskData.name = `${typeLabel} Task: ${itemCount} items - ${scheduleLabel}`;
      }

      // Insert task into database
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
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::task_priority_level, $13, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
        taskData.auto_delete || false,
        taskData.is_active,
        taskData.priority,
        taskData.user_id
      ]);

      logger.info('Task created successfully', {
        taskId: dbResult.rows[0].id,
        taskType: taskData.task_type
      });

      res.status(201).json(dbResult.rows[0]);
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

      res.json(result.rows[0]);
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

      // Get task details from download manager
      const details = await this.downloadManager.getTaskDetails(taskId);
      res.json(details);
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

      // Update task status
      await client.query(`
        UPDATE tasks
        SET status = 'running',
            last_run = CURRENT_TIMESTAMP
        WHERE id = $1
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
      logger.error('Error running task:', error);
      res.status(500).json({ error: 'Failed to run task' });
    } finally {
      client.release();
    }
  }
}

export const createTasksController = (pool: Pool, downloadManager: DownloadManager) =>
  new TasksController(pool, downloadManager);

export default TasksController;

// backend/src/routes/tasks/controller.ts

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { validateTaskData } from './validation';
import { Task, CreateTaskDTO } from '../../types/database';
import { taskQueries } from '../../database/migrations/schemas/tasks';
import { parseExpression } from 'cron-parser';

export class TasksController {
  constructor(private pool: Pool) {}

  getAllTasks = async (req: Request, res: Response): Promise<void> => {
    try {
      const tasks = await taskQueries.getAllTasks(this.pool);
      res.json(tasks);
    } catch (error) {
      logger.error('Error fetching tasks:', error);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  };

  getTaskById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const task = await taskQueries.getTaskById(this.pool, parseInt(id));

      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      res.json(task);
    } catch (error) {
      logger.error('Error fetching task:', error);
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  };

  getTaskHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { limit } = req.query;

      const history = await taskQueries.getTaskHistory(
        this.pool,
        parseInt(id),
        limit ? parseInt(limit as string) : 10
      );

      res.json(history);
    } catch (error) {
      logger.error('Error fetching task history:', error);
      res.status(500).json({ error: 'Failed to fetch task history' });
    }
  };

  createTask = async (req: Request, res: Response): Promise<void> => {
    try {
      const taskData = req.body;

      // Validate task data
      const validationError = validateTaskData(taskData);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }

      // Validate cron expression if schedule type is cron
      if (taskData.schedule_type === 'cron') {
        try {
          parseExpression(taskData.schedule_value);
        } catch (error) {
          res.status(400).json({ error: 'Invalid cron expression' });
          return;
        }
      }

      // Validate interval if schedule type is interval
      if (taskData.schedule_type === 'interval') {
        const interval = parseInt(taskData.schedule_value);
        if (isNaN(interval) || interval < 60) {
          res.status(400).json({ error: 'Invalid interval. Must be at least 60 seconds.' });
          return;
        }
      }

      // Add missing properties user_id and status
      const taskToCreate: CreateTaskDTO = {
        name: taskData.name,
        description: taskData.description || null,
        task_type: taskData.task_type,
        channel_ids: taskData.channel_ids || [],
        game_ids: taskData.game_ids || [],
        schedule_type: taskData.schedule_type,
        schedule_value: taskData.schedule_value,
        storage_limit_gb: taskData.storage_limit_gb || null,
        retention_days: taskData.retention_days || null,
        auto_delete: taskData.auto_delete || false,
        is_active: true,
        priority: taskData.priority || 1,
        user_id: taskData.user_id,
        status: taskData.status || 'pending'
      };

      const task = await taskQueries.createTask(this.pool, taskToCreate);
      res.status(201).json(task);
    } catch (error) {
      logger.error('Error creating task:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  };

  updateTask = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Validate cron expression if updating schedule
      if (updateData.schedule_type === 'cron' && updateData.schedule_value) {
        try {
          parseExpression(updateData.schedule_value);
        } catch (error) {
          res.status(400).json({ error: 'Invalid cron expression' });
          return;
        }
      }

      // Validate interval if updating schedule
      if (updateData.schedule_type === 'interval' && updateData.schedule_value) {
        const interval = parseInt(updateData.schedule_value);
        if (isNaN(interval) || interval < 60) {
          res.status(400).json({ error: 'Invalid interval. Must be at least 60 seconds.' });
          return;
        }
      }

      const task = await taskQueries.updateTask(this.pool, parseInt(id), updateData);

      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      res.json(task);
    } catch (error) {
      logger.error('Error updating task:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  };

  deleteTask = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const success = await taskQueries.deleteTask(this.pool, parseInt(id));

      if (!success) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      res.json({ message: 'Task deleted successfully' });
    } catch (error) {
      logger.error('Error deleting task:', error);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  };

  manualRunTask = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const task = await taskQueries.getTaskById(this.pool, parseInt(id));

      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      // Add to task history
      await taskQueries.addTaskHistory(this.pool, {
        task_id: task.id,
        status: 'success',
        start_time: new Date(),
        end_time: new Date(),
        details: { trigger: 'manual' }
      });

      // Update last_run and next_run based on schedule
      let nextRun: Date | null = null;

      if (task.schedule_type === 'interval') {
        nextRun = new Date(Date.now() + parseInt(task.schedule_value) * 1000);
      } else if (task.schedule_type === 'cron') {
        const interval = parseExpression(task.schedule_value);
        nextRun = interval.next().toDate();
      }

      if (nextRun) {
        await taskQueries.updateNextRun(this.pool, task.id, nextRun);
      }

      res.json({ message: 'Task executed successfully' });
    } catch (error) {
      logger.error('Error executing task:', error);
      res.status(500).json({ error: 'Failed to execute task' });
    }
  };
}

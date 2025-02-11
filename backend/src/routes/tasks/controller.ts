// Filepath: backend/src/routes/tasks/controller.ts

import { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { TaskOperations } from './operations';
import { CreateTaskSchema } from './validation';

export class TasksController {
  constructor(private operations: TaskOperations) {
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
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const tasks = await this.operations.getAllTasks(Number(userId));
      res.json(tasks);
    } catch (err) {
      logger.error('Error fetching tasks:', err);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  }

  async getTaskById(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const task = await this.operations.getTaskById(taskId, Number(userId));
      res.json(task);
    } catch (err) {
      logger.error('Error fetching task:', err);
      const error = err as Error;
      if (error.message === 'Task not found') {
        res.status(404).json({ error: 'Task not found' });
      } else {
        res.status(500).json({ error: 'Failed to fetch task' });
      }
    }
  }

  async createTask(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Parse and validate request data
      const result = CreateTaskSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: result.error.errors
        });
      }

      const task = await this.operations.createTask(Number(userId), result.data);
      res.status(201).json(task);
    } catch (err) {
      logger.error('Error creating task:', err);
      res.status(500).json({ error: 'Failed to create task' });
    }
  }

  async updateTask(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const task = await this.operations.updateTask(taskId, Number(userId), req.body);
      res.json(task);
    } catch (err) {
      logger.error('Error updating task:', err);
      const error = err as Error;
      if (error.message === 'Task not found or access denied') {
        res.status(404).json({ error: 'Task not found' });
      } else {
        res.status(500).json({ error: 'Failed to update task' });
      }
    }
  }

  async deleteTask(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      await this.operations.deleteTask(taskId, Number(userId));
      res.json({ message: 'Task deleted successfully' });
    } catch (err) {
      logger.error('Error deleting task:', err);
      const error = err as Error;
      if (error.message === 'Task not found or access denied') {
        res.status(404).json({ error: 'Task not found' });
      } else {
        res.status(500).json({ error: 'Failed to delete task' });
      }
    }
  }

  async getTaskHistory(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const history = await this.operations.getTaskHistory(taskId, Number(userId), limit);
      res.json(history);
    } catch (err) {
      logger.error('Error fetching task history:', err);
      const error = err as Error;
      if (error.message === 'Task not found') {
        res.status(404).json({ error: 'Task not found' });
      } else {
        res.status(500).json({ error: 'Failed to fetch task history' });
      }
    }
  }

  async getTaskDetails(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const task = await this.operations.getTaskById(taskId, Number(userId));
      const managerDetails = await this.operations.getTaskManagerDetails();

      res.json({
        ...task,
        ...managerDetails
      });
    } catch (err) {
      logger.error('Error fetching task details:', err);
      const error = err as Error;
      if (error.message === 'Task not found') {
        res.status(404).json({ error: 'Task not found' });
      } else {
        res.status(500).json({ error: 'Failed to fetch task details' });
      }
    }
  }

  async manualRunTask(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Force task status to running
      const task = await this.operations.updateTask(taskId, Number(userId), {
        status: 'running',
        is_active: true
      });

      logger.info(`Task ${taskId} started manually by user ${userId}`, {
        monitoring_enabled: task.monitoring_enabled,
        taskState: task.status,
        monitoringStatus: task.monitoring_status
      });

      res.json(task);
    } catch (err) {
      logger.error('Error running task:', err);
      const error = err as Error;
      if (error.message === 'Task not found or access denied') {
        res.status(404).json({ error: 'Task not found' });
      } else {
        res.status(500).json({
          error: 'Failed to run task',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  async batchUpdateTasks(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const result = await this.operations.batchUpdateTasks(Number(userId), req.body);
      res.json(result);
    } catch (err) {
      logger.error('Error updating tasks:', err);
      res.status(500).json({ error: 'Failed to update tasks' });
    }
  }

  async batchDeleteTasks(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      await this.operations.deleteTask(Number(userId), req.body.task_ids);
      res.json({ message: 'Tasks deleted successfully' });
    } catch (err) {
      logger.error('Error deleting tasks:', err);
      res.status(500).json({
        error: 'Failed to delete tasks',
        details: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  }
}

export const createTasksController = (operations: TaskOperations) =>
  new TasksController(operations);

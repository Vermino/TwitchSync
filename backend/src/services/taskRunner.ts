// Filepath: backend/src/services/taskRunner.ts

import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { DownloadManager } from './downloadManager';
import {
  Task,
  TaskStatus,
  TaskProgressInfo,
  TaskDetails
} from '../types/database';

export class TaskRunner {
  private static instance: TaskRunner;
  private pool: Pool;
  private downloadManager: DownloadManager;
  private activeTasks: Set<number> = new Set();
  private taskIntervals: Map<number, NodeJS.Timeout> = new Map();

  private constructor(pool: Pool, downloadManager: DownloadManager) {
    this.pool = pool;
    this.downloadManager = downloadManager;
  }

  public static getInstance(pool: Pool, downloadManager: DownloadManager): TaskRunner {
    if (!TaskRunner.instance) {
      TaskRunner.instance = new TaskRunner(pool, downloadManager);
    }
    return TaskRunner.instance;
  }

  public async startTask(taskId: number): Promise<void> {
    if (this.activeTasks.has(taskId)) {
      logger.warn(`Task ${taskId} is already running`);
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get task details
      const taskResult = await client.query<Task>(
        'SELECT * FROM tasks WHERE id = $1',
        [taskId]
      );

      if (taskResult.rows.length === 0) {
        throw new Error(`Task ${taskId} not found`);
      }

      const task = taskResult.rows[0];

      // Check if task should be started
      if (!task.is_active) {
        logger.info(`Task ${taskId} is inactive, skipping execution`);
        return;
      }

      // Update task status
      await client.query(
        `UPDATE tasks 
         SET status = 'running',
             last_run = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [taskId]
      );

      // Create task history entry
      await client.query(
        `INSERT INTO task_history (
           task_id,
           status,
           start_time,
           details
         ) VALUES ($1, 'running', NOW(), $2)`,
        [taskId, { trigger: 'system' }]
      );

      await client.query('COMMIT');

      // Add to active tasks
      this.activeTasks.add(taskId);

      // Execute task
      this.executeTask(taskId).catch(error => {
        logger.error(`Error executing task ${taskId}:`, error);
      });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error starting task ${taskId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async executeTask(taskId: number): Promise<void> {
    try {
      await this.downloadManager.executeTask(taskId);

      // Update task completion status
      await this.updateTaskCompletion(taskId, 'completed');
    } catch (error) {
      logger.error(`Task ${taskId} execution failed:`, error);
      await this.updateTaskCompletion(taskId, 'failed', error);
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  private async updateTaskCompletion(
    taskId: number,
    status: TaskStatus,
    error?: Error
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update task status
      await client.query(
        `UPDATE tasks 
         SET status = $2,
             error_message = $3,
             updated_at = NOW(),
             next_run = CASE 
               WHEN schedule_type = 'interval' 
                 THEN NOW() + (schedule_value || ' seconds')::interval
               ELSE NULL 
             END
         WHERE id = $1`,
        [taskId, status, error?.message]
      );

      // Update task history
      await client.query(
        `UPDATE task_history 
         SET status = $2,
             end_time = NOW(),
             error_message = $3
         WHERE task_id = $1 
         AND end_time IS NULL`,
        [taskId, status, error?.message]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error updating task ${taskId} completion:`, error);
    } finally {
      client.release();
    }
  }

  public async scheduleTask(taskId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      const taskResult = await client.query<Task>(
        'SELECT * FROM tasks WHERE id = $1',
        [taskId]
      );

      if (taskResult.rows.length === 0) {
        throw new Error(`Task ${taskId} not found`);
      }

      const task = taskResult.rows[0];

      // Clear existing interval if any
      if (this.taskIntervals.has(taskId)) {
        clearInterval(this.taskIntervals.get(taskId));
        this.taskIntervals.delete(taskId);
      }

      if (!task.is_active) {
        logger.info(`Task ${taskId} is inactive, not scheduling`);
        return;
      }

      if (task.schedule_type === 'interval') {
        const interval = parseInt(task.schedule_value) * 1000; // Convert to milliseconds
        const intervalId = setInterval(() => {
          this.startTask(taskId).catch(error => {
            logger.error(`Error executing scheduled task ${taskId}:`, error);
          });
        }, interval);

        this.taskIntervals.set(taskId, intervalId);
        logger.info(`Scheduled task ${taskId} to run every ${interval/1000} seconds`);
      }
    } catch (error) {
      logger.error(`Error scheduling task ${taskId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  public async stopTask(taskId: number): Promise<void> {
    if (this.taskIntervals.has(taskId)) {
      clearInterval(this.taskIntervals.get(taskId));
      this.taskIntervals.delete(taskId);
    }

    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE tasks 
         SET is_active = false,
             updated_at = NOW()
         WHERE id = $1`,
        [taskId]
      );
    } catch (error) {
      logger.error(`Error stopping task ${taskId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  public async getTaskStatus(taskId: number): Promise<TaskDetails> {
    return this.downloadManager.getTaskDetails(taskId);
  }

  public async startAllTasks(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<Task>(
        'SELECT id FROM tasks WHERE is_active = true'
      );

      for (const task of result.rows) {
        await this.scheduleTask(task.id);
      }
    } catch (error) {
      logger.error('Error starting all tasks:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  public destroy(): void {
    // Clear all intervals
    for (const intervalId of this.taskIntervals.values()) {
      clearInterval(intervalId);
    }
    this.taskIntervals.clear();
    this.activeTasks.clear();
  }
}

export const createTaskRunner = (pool: Pool, downloadManager: DownloadManager) =>
  TaskRunner.getInstance(pool, downloadManager);

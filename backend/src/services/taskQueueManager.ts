// Filepath: backend/src/services/taskQueueManager.ts

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { TaskRunner } from './taskRunner';
import { Task, TaskPriority } from '../types/database';

interface QueuedTask {
  id: number;
  priority: TaskPriority;
  scheduledTime: Date;
  retryCount: number;
}

export class TaskQueueManager {
  private static instance: TaskQueueManager;
  private pool: Pool;
  private taskRunner: TaskRunner;
  private queue: QueuedTask[] = [];
  private processing: boolean = false;
  private maxConcurrent: number = 1;
  private runningTasks: Set<number> = new Set();
  private queueInterval: NodeJS.Timeout | null = null;

  private constructor(pool: Pool, taskRunner: TaskRunner, maxConcurrent: number = 10) {
    this.pool = pool;
    this.taskRunner = taskRunner;
    this.maxConcurrent = maxConcurrent;
  }

  public static getInstance(pool: Pool, taskRunner: TaskRunner, maxConcurrent?: number): TaskQueueManager {
    if (!TaskQueueManager.instance) {
      TaskQueueManager.instance = new TaskQueueManager(pool, taskRunner, maxConcurrent);
    }
    return TaskQueueManager.instance;
  }

  public async enqueueTask(taskId: number, priority: TaskPriority = 'low'): Promise<void> {
    // Check if task is already in queue or running
    if (this.queue.some(t => t.id === taskId) || this.runningTasks.has(taskId)) {
      logger.warn(`Task ${taskId} is already queued or running`);
      return;
    }

    // Implement task cleanup for old/stale tasks
    await this.cleanupStaleTasks();

    const queuedTask: QueuedTask = {
      id: taskId,
      priority,
      scheduledTime: new Date(),
      retryCount: 0
    };

    // Insert task into queue based on priority
    const insertIndex = this.queue.findIndex(t =>
      this.getPriorityValue(t.priority) < this.getPriorityValue(priority)
    );

    if (insertIndex === -1) {
      this.queue.push(queuedTask);
    } else {
      this.queue.splice(insertIndex, 0, queuedTask);
    }

    logger.info(`Task ${taskId} enqueued with priority ${priority}`);

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  public async activateTask(taskId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update task status to running and set is_active to true
      await client.query(`
        UPDATE tasks 
        SET status = 'running',
            is_active = true,
            updated_at = NOW()
        WHERE id = $1
      `, [taskId]);

      // Initialize or update task monitoring
      await client.query(`
        INSERT INTO task_monitoring (
          task_id,
          status,
          status_message,
          progress_percentage,
          items_total,
          items_completed,
          items_failed,
          last_check_at,
          created_at,
          updated_at
        ) VALUES (
          $1, 'running', 'Task activated', 0, 0, 0, 0, NOW(), NOW(), NOW()
        )
        ON CONFLICT (task_id) 
        DO UPDATE SET
          status = 'running',
          status_message = 'Task activated',
          progress_percentage = 0,
          updated_at = NOW()
      `, [taskId]);

      await client.query('COMMIT');

      // Enqueue task for processing
      await this.enqueueTask(taskId, 'normal');

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error activating task ${taskId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  private getPriorityValue(priority: TaskPriority): number {
    switch (priority) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;

    this.processing = true;

    try {
      while (this.queue.length > 0 && this.runningTasks.size < this.maxConcurrent) {
        const task = this.queue.shift();
        if (!task) continue;

        this.runningTasks.add(task.id);

        try {
          await this.taskRunner.startTask(task.id);
          logger.info(`Task ${task.id} completed successfully`);
        } catch (error) {
          logger.error(`Error executing task ${task.id}:`, error);

          // Implement retry mechanism with backoff
          if (task.retryCount < 3) {
            task.retryCount++;
            // Exponential backoff: 1min, 2min, 4min
            const backoffDelay = Math.pow(2, task.retryCount - 1) * 60000;
            task.scheduledTime = new Date(Date.now() + backoffDelay);
            this.queue.push(task);
            logger.info(`Task ${task.id} requeued for retry attempt ${task.retryCount}`);
          } else {
            await this.handleTaskFailure(task.id, error instanceof Error ? error : new Error(String(error)));
          }
        } finally {
          this.runningTasks.delete(task.id);
        }
      }
    } finally {
      this.processing = false;

      // If there are more tasks and capacity, continue processing
      if (this.queue.length > 0 && this.runningTasks.size < this.maxConcurrent) {
        setImmediate(() => this.processQueue());
      }
    }
  }

  private async cleanupStaleTasks(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Find and cleanup tasks that have been stuck in 'running' state
      await client.query(`
        UPDATE tasks
        SET status = 'failed',
            error_message = 'Task cleanup: Task was stuck in running state',
            updated_at = NOW()
        WHERE status = 'running'
        AND updated_at < NOW() - INTERVAL '1 hour'
      `);

      // Remove stale tasks from monitoring
      await client.query(`
        UPDATE task_monitoring
        SET status = 'failed',
            status_message = 'Task cleanup: Monitoring entry was stale',
            updated_at = NOW()
        WHERE status = 'running'
        AND updated_at < NOW() - INTERVAL '1 hour'
      `);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error cleaning up stale tasks:', error);
    } finally {
      client.release();
    }
  }

  private async handleTaskFailure(taskId: number, error: Error): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update task status
      await client.query(`
        UPDATE tasks 
        SET status = 'failed',
            error_message = $2,
            updated_at = NOW()
        WHERE id = $1
      `, [taskId, error.message]);

      // Create failure event
      await client.query(`
        INSERT INTO task_events (
          task_id,
          event_type,
          details,
          created_at
        ) VALUES ($1, 'failure', $2, NOW())
      `, [taskId, JSON.stringify({
        error: error.message,
        stack: error.stack,
        retry_count: 3,
        final_failure: true
      })]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`Error handling task failure for task ${taskId}:`, err);
    } finally {
      client.release();
    }
  }

  public async startQueueProcessor(checkIntervalMs: number = 5000): Promise<void> {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
    }

    this.queueInterval = setInterval(() => {
      this.checkScheduledTasks().catch(error => {
        logger.error('Error checking scheduled tasks:', error);
      });
    }, checkIntervalMs);

    logger.info('Queue processor started');
  }

  private async checkScheduledTasks(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Get tasks that are due to run
      const result = await client.query<Task>(`
        SELECT id, priority 
        FROM tasks 
        WHERE is_active = true
        AND status = 'running'
        AND (\n          (schedule_type = 'interval' AND next_run <= NOW())
          OR
          (schedule_type = 'cron' AND next_run <= NOW())
        )
        ORDER BY 
          CASE priority
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
          END,
          next_run ASC
        LIMIT $1
      `, [this.maxConcurrent - this.runningTasks.size]);

      for (const task of result.rows) {
        await this.enqueueTask(task.id, task.priority);
      }
    } catch (error) {
      logger.error('Error checking scheduled tasks:', error);
    } finally {
      client.release();
    }
  }

  public async stopQueueProcessor(): Promise<void> {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }

    this.queue = [];
    this.processing = false;
    logger.info('Queue processor stopped');
  }

  public getQueueStatus(): {
    queueLength: number;
    runningTasks: number;
    maxConcurrent: number;
  } {
    return {
      queueLength: this.queue.length,
      runningTasks: this.runningTasks.size,
      maxConcurrent: this.maxConcurrent
    };
  }

  public async clearQueue(): Promise<void> {
    this.queue = [];
    logger.info('Task queue cleared');
  }
}

export const createTaskQueueManager = (pool: Pool, taskRunner: TaskRunner, maxConcurrent?: number) =>
  TaskQueueManager.getInstance(pool, taskRunner, maxConcurrent);

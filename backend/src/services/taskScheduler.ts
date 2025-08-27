// Task Scheduler - handles scheduled task execution based on next_run timestamps
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import DownloadManager from './downloadManager/index';

interface ScheduledTask {
  id: number;
  name: string;
  user_id: number;
  next_run: Date;
  schedule_type: string;
  schedule_value: string;
  status: string;
  is_active: boolean;
}

export class TaskScheduler {
  private schedulerInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(
    private pool: Pool,
    private downloadManager: DownloadManager,
    private intervalMs: number = 60000 // Check every minute by default
  ) {}

  public start(): void {
    if (this.isRunning) {
      logger.warn('Task scheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting task scheduler with ${this.intervalMs}ms interval`);

    // Run immediately
    this.checkAndExecuteTasks().catch(error => {
      logger.error('Error in initial task scheduler run:', error);
    });

    // Set up interval
    this.schedulerInterval = setInterval(() => {
      this.checkAndExecuteTasks().catch(error => {
        logger.error('Error in task scheduler interval:', error);
      });
    }, this.intervalMs);

    logger.info('Task scheduler started successfully');
  }

  public stop(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    this.isRunning = false;
    logger.info('Task scheduler stopped');
  }

  private async checkAndExecuteTasks(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Find all overdue tasks that are active and should be running
      const overdueTasksResult = await client.query<ScheduledTask>(`
        SELECT 
          id, name, user_id, next_run, schedule_type, schedule_value, status, is_active
        FROM tasks
        WHERE is_active = true 
        AND status = 'pending'
        AND next_run IS NOT NULL
        AND next_run <= NOW()
        ORDER BY next_run ASC
        LIMIT 10
      `);

      if (overdueTasksResult.rows.length === 0) {
        logger.debug('No overdue tasks found');
        return;
      }

      logger.info(`Found ${overdueTasksResult.rows.length} overdue tasks to execute`);

      for (const task of overdueTasksResult.rows) {
        try {
          await this.executeScheduledTask(task);
        } catch (error) {
          logger.error(`Error executing task ${task.id}:`, error);
          await this.handleTaskExecutionError(task.id, error as Error);
        }
      }
    } catch (error) {
      logger.error('Error checking for overdue tasks:', error);
    } finally {
      client.release();
    }
  }

  private async executeScheduledTask(task: ScheduledTask): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const overdueDuration = Date.now() - new Date(task.next_run).getTime();
      const overdueMins = Math.round(overdueDuration / (1000 * 60));

      logger.info(`Executing overdue task ${task.id} "${task.name}" (${overdueMins} minutes late)`);

      // Update task status to running and set new next_run
      const nextRun = this.calculateNextRun(task.schedule_type, task.schedule_value);
      
      await client.query(`
        UPDATE tasks 
        SET status = 'running'::task_status,
            last_run = NOW(),
            next_run = $1,
            updated_at = NOW()
        WHERE id = $2
      `, [nextRun, task.id]);

      // Update monitoring status
      await client.query(`
        UPDATE task_monitoring
        SET status = 'running',
            status_message = $1,
            updated_at = NOW()
        WHERE task_id = $2
      `, [`Task executing (was ${overdueMins}m overdue)`, task.id]);

      await client.query('COMMIT');

      // Start the actual task execution (VOD discovery and downloads)
      logger.info(`Starting download manager execution for task ${task.id}`);
      await this.downloadManager.executeTask(task.id);
      
      logger.info(`Task ${task.id} execution initiated successfully`);

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error executing scheduled task ${task.id}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  private calculateNextRun(scheduleType: string, scheduleValue: string): Date | null {
    const now = new Date();

    switch (scheduleType) {
      case 'interval':
        // scheduleValue is in seconds
        const intervalSeconds = parseInt(scheduleValue);
        if (isNaN(intervalSeconds)) return null;
        return new Date(now.getTime() + intervalSeconds * 1000);

      case 'daily':
        // Schedule for next day at same time
        const nextDay = new Date(now);
        nextDay.setDate(nextDay.getDate() + 1);
        return nextDay;

      case 'hourly':
        // Schedule for next hour
        const nextHour = new Date(now);
        nextHour.setHours(nextHour.getHours() + 1);
        nextHour.setMinutes(0);
        nextHour.setSeconds(0);
        return nextHour;

      case 'cron':
        // For now, just set to 1 hour later - proper cron parsing would need a library
        const oneHourLater = new Date(now.getTime() + 3600 * 1000);
        return oneHourLater;

      default:
        logger.warn(`Unknown schedule type: ${scheduleType}`);
        return null;
    }
  }

  private async handleTaskExecutionError(taskId: number, error: Error): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Update task status to failed with error message
      await client.query(`
        UPDATE tasks 
        SET status = 'failed'::task_status,
            updated_at = NOW()
        WHERE id = $1
      `, [taskId]);

      // Update monitoring with error details
      await client.query(`
        UPDATE task_monitoring
        SET status = 'failed',
            status_message = $1,
            updated_at = NOW()
        WHERE task_id = $2
      `, [`Execution failed: ${error.message}`, taskId]);

      // Log the failure event
      await client.query(`
        INSERT INTO task_events (
          task_id, event_type, details, created_at
        ) VALUES ($1, 'execution_failed', $2, NOW())
      `, [taskId, JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString(),
        reason: 'scheduler_execution_error'
      })]);

      logger.error(`Task ${taskId} marked as failed due to execution error`);
    } catch (dbError) {
      logger.error(`Error handling task execution failure for task ${taskId}:`, dbError);
    } finally {
      client.release();
    }
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      hasSchedulerInterval: this.schedulerInterval !== null
    };
  }
}

// Factory function for easy import
export const createTaskScheduler = (pool: Pool, downloadManager: DownloadManager, intervalMs?: number) => 
  new TaskScheduler(pool, downloadManager, intervalMs);
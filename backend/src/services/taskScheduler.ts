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
      
      // Also check for task completion
      this.checkTaskCompletion().catch(error => {
        logger.error('Error checking task completion:', error);
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
      // Include 'pending' tasks for scheduled scanning and 'ready' tasks that might need re-scanning
      const overdueTasksResult = await client.query<ScheduledTask>(`
        SELECT 
          id, name, user_id, next_run, schedule_type, schedule_value, status, is_active
        FROM tasks
        WHERE is_active = true 
        AND status IN ('pending', 'ready')
        AND next_run IS NOT NULL
        AND next_run <= NOW()
        ORDER BY 
          CASE status 
            WHEN 'pending' THEN 1
            WHEN 'ready' THEN 2
            ELSE 3
          END,
          next_run ASC
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

      // Update task status to scanning and set new next_run for future scans
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
        SET status = 'scanning',
            status_message = $1,
            updated_at = NOW()
        WHERE task_id = $2
      `, [`Starting VOD scan (was ${overdueMins}m overdue)`, task.id]);

      await client.query('COMMIT');

      // Start the actual task execution (VOD discovery only - not downloads)
      logger.info(`Starting VOD scanning for task ${task.id}`);
      await this.downloadManager.executeTask(task.id, 'scan');
      
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
        // scheduleValue is in seconds - but for our use case, default to 12 hours
        const intervalSeconds = parseInt(scheduleValue) || (12 * 3600); // Default 12 hours
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

      case 'every_12_hours':
        // Schedule for 12 hours later
        return new Date(now.getTime() + (12 * 3600 * 1000));

      case 'cron':
        // For now, just set to 12 hours later - proper cron parsing would need a library
        const twelveHoursLater = new Date(now.getTime() + (12 * 3600 * 1000));
        return twelveHoursLater;

      default:
        logger.warn(`Unknown schedule type: ${scheduleType}, defaulting to 12 hours`);
        // Default to 12 hours for any unknown schedule type
        return new Date(now.getTime() + (12 * 3600 * 1000));
    }
  }

  private async handleTaskExecutionError(taskId: number, error: Error): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Update task status back to pending for retry, not failed
      // Set next_run to 1 hour later for retry
      await client.query(`
        UPDATE tasks 
        SET status = 'pending'::task_status,
            next_run = NOW() + INTERVAL '1 hour',
            updated_at = NOW()
        WHERE id = $1
      `, [taskId]);

      // Update monitoring with error details but don't mark as failed
      await client.query(`
        UPDATE task_monitoring
        SET status = 'pending',
            status_message = $1,
            updated_at = NOW()
        WHERE task_id = $2
      `, [`Scan failed, will retry in 1 hour: ${error.message}`, taskId]);

      // Log the failure event but as a retry
      await client.query(`
        INSERT INTO task_events (
          task_id, event_type, details, created_at
        ) VALUES ($1, 'scan_failed_retry_scheduled', $2, NOW())
      `, [taskId, JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString(),
        reason: 'scheduler_scan_error',
        retry_at: new Date(Date.now() + 3600000).toISOString()
      })]);

      logger.warn(`Task ${taskId} scan failed, scheduled for retry in 1 hour: ${error.message}`);
    } catch (dbError) {
      logger.error(`Error handling task execution failure for task ${taskId}:`, dbError);
    } finally {
      client.release();
    }
  }

  /**
   * Check task completion status and update accordingly
   */
  public async checkTaskCompletion(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Find tasks that are downloading but all their VODs are completed/failed
      const completedTasksResult = await client.query(`
        SELECT DISTINCT t.id, t.name,
               COUNT(v.id) as total_vods,
               COUNT(CASE WHEN v.download_status = 'completed' THEN 1 END) as completed_vods,
               COUNT(CASE WHEN v.download_status = 'failed' THEN 1 END) as failed_vods
        FROM tasks t
        INNER JOIN vods v ON v.task_id = t.id
        WHERE t.status = 'downloading'
        AND v.status IN ('completed', 'failed')
        GROUP BY t.id, t.name
        HAVING COUNT(v.id) = COUNT(CASE WHEN v.download_status IN ('completed', 'failed') THEN 1 END)
      `);

      for (const task of completedTasksResult.rows) {
        const hasFailures = parseInt(task.failed_vods) > 0;
        const newStatus = hasFailures ? 'completed_with_errors' : 'completed';
        
        await client.query(`
          UPDATE tasks 
          SET status = $1::task_status,
              updated_at = NOW()
          WHERE id = $2
        `, [newStatus, task.id]);

        await client.query(`
          UPDATE task_monitoring
          SET status = $1,
              status_message = $2,
              progress_percentage = 100,
              updated_at = NOW()
          WHERE task_id = $3
        `, [
          newStatus,
          `Downloads completed: ${task.completed_vods}/${task.total_vods} successful${hasFailures ? ` (${task.failed_vods} failed)` : ''}`,
          task.id
        ]);

        logger.info(`Task ${task.id} "${task.name}" completed: ${task.completed_vods}/${task.total_vods} successful${hasFailures ? ` (${task.failed_vods} failed)` : ''}`);
      }

    } catch (error) {
      logger.error('Error checking task completion:', error);
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
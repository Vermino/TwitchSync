// Filepath: backend/src/services/taskNotifications.ts

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { TaskStatus } from '../types/database';

interface NotificationSettings {
  task_started: boolean;
  task_completed: boolean;
  task_failed: boolean;
  storage_warning: boolean;
  error_threshold: number;
}

export class TaskNotifications {
  private static instance: TaskNotifications;
  private pool: Pool;

  private constructor(pool: Pool) {
    this.pool = pool;
  }

  public static getInstance(pool: Pool): TaskNotifications {
    if (!TaskNotifications.instance) {
      TaskNotifications.instance = new TaskNotifications(pool);
    }
    return TaskNotifications.instance;
  }

  private async getUserNotificationSettings(userId: number): Promise<NotificationSettings> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT notification_settings
        FROM user_preferences
        WHERE user_id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return {
          task_started: true,
          task_completed: true,
          task_failed: true,
          storage_warning: true,
          error_threshold: 20
        };
      }

      return result.rows[0].notification_settings;
    } finally {
      client.release();
    }
  }

  public async notifyTaskStatus(
    taskId: number,
    status: TaskStatus,
    details?: Record<string, any>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Get task and user information
      const taskResult = await client.query(`
        SELECT t.*, u.id as user_id
        FROM tasks t
        JOIN users u ON t.user_id = u.id
        WHERE t.id = $1
      `, [taskId]);

      if (taskResult.rows.length === 0) {
        logger.warn(`Task ${taskId} not found for notification`);
        return;
      }

      const task = taskResult.rows[0];
      const settings = await this.getUserNotificationSettings(task.user_id);

      // Determine if notification should be sent
      let shouldNotify = false;
      let notificationType = '';
      let message = '';

      switch (status) {
        case 'running':
          if (settings.task_started) {
            shouldNotify = true;
            notificationType = 'task_started';
            message = `Task "${task.name}" has started execution`;
          }
          break;

        case 'completed':
          if (settings.task_completed) {
            shouldNotify = true;
            notificationType = 'task_completed';
            message = `Task "${task.name}" has completed successfully`;
          }
          break;

        case 'failed':
          if (settings.task_failed) {
            shouldNotify = true;
            notificationType = 'task_failed';
            message = `Task "${task.name}" has failed: ${details?.error || 'Unknown error'}`;
          }
          break;

        case 'completed_with_errors':
          if (settings.task_failed) {
            shouldNotify = true;
            notificationType = 'task_warning';
            message = `Task "${task.name}" completed with errors: ${details?.error || 'Some operations failed'}`;
          }
          break;
      }

      if (shouldNotify) {
        // Create notification
        await client.query(`
          INSERT INTO user_notifications (
            user_id,
            task_id,
            type,
            message,
            details,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
          task.user_id,
          taskId,
          notificationType,
          message,
          JSON.stringify(details || {})
        ]);

        // Log notification
        logger.info(`Notification sent for task ${taskId}:`, {
          type: notificationType,
          message
        });
      }

    } catch (error) {
      logger.error(`Error sending notification for task ${taskId}:`, error);
    } finally {
      client.release();
    }
  }

  public async notifyStorageWarning(
    taskId: number,
    usedPercentage: number
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Get task and user information
      const taskResult = await client.query(`
        SELECT t.*, u.id as user_id
        FROM tasks t
        JOIN users u ON t.user_id = u.id
        WHERE t.id = $1
      `, [taskId]);

      if (taskResult.rows.length === 0) return;

      const task = taskResult.rows[0];
      const settings = await this.getUserNotificationSettings(task.user_id);

      if (settings.storage_warning && usedPercentage >= 90) {
        const message = `Storage warning for task "${task.name}": ${usedPercentage}% of allocated storage used`;

        await client.query(`
          INSERT INTO user_notifications (
            user_id,
            task_id,
            type,
            message,
            details,
            created_at
          ) VALUES ($1, $2, 'storage_warning', $3, $4, NOW())
        `, [
          task.user_id,
          taskId,
          message,
          JSON.stringify({ usedPercentage })
        ]);

        logger.warn(`Storage warning for task ${taskId}:`, {
          usedPercentage,
          taskName: task.name
        });
      }
    } catch (error) {
      logger.error(`Error sending storage warning for task ${taskId}:`, error);
    } finally {
      client.release();
    }
  }

  public async clearNotifications(userId: number, taskId?: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      if (taskId) {
        await client.query(`
          DELETE FROM user_notifications
          WHERE user_id = $1 AND task_id = $2
        `, [userId, taskId]);
      } else {
        await client.query(`
          DELETE FROM user_notifications
          WHERE user_id = $1
        `, [userId]);
      }
    } catch (error) {
      logger.error('Error clearing notifications:', error);
    } finally {
      client.release();
    }
  }
}

export const createTaskNotifications = (pool: Pool) =>
  TaskNotifications.getInstance(pool);

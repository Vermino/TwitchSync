// Filepath: backend/src/routes/tasks/controller.ts

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import DownloadManager from '../../services/downloadManager/index';
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
        res.status(401).json({error: 'User not authenticated'});
        return;
      }

      // Updated query to properly join with task_monitoring and task_statistics
      const result = await client.query(`
        WITH latest_monitoring AS (SELECT DISTINCT
                                   ON (task_id)
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
                                   ORDER BY task_id, created_at DESC)
        SELECT t.*,
               tm.monitoring_status,
               tm.status_message,
               tm.progress_percentage,
               tm.items_total,
               tm.items_completed,
               ts.total_vods,
               ts.successful_downloads,
               ts.failed_downloads,
               ts.total_storage_bytes,
               ts.avg_download_speed,
               COALESCE(
                   jsonb_build_object(
                       'percentage', COALESCE(tm.progress_percentage, 0),
                       'status_message', tm.status_message,
                       'current_progress', jsonb_build_object(
                           'completed', COALESCE(tm.items_completed, 0),
                           'total', COALESCE(tm.items_total, 0),
                           'failed', COALESCE(tm.items_failed, 0)
                         )
                     ),
                   jsonb_build_object(
                       'percentage', 0,
                       'status_message', null,
                       'current_progress', null
                     )
                 )                as progress,
               tpm.execution_time as last_execution_time,
               tpm.success_rate,
               tpm.failure_rate
        FROM tasks t
               LEFT JOIN latest_monitoring tm ON t.id = tm.task_id
               LEFT JOIN task_statistics ts ON t.id = ts.task_id
               LEFT JOIN LATERAL(
          SELECT *
          FROM task_performance_metrics
          WHERE task_id = t.id
          ORDER BY measured_at DESC
          LIMIT 1
        ) tpm ON true
        WHERE t.user_id = $1
        ORDER BY t.created_at DESC
      `, [userId]);

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
      res.status(500).json({error: 'Failed to fetch tasks'});
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
        res.status(401).json({error: 'User not authenticated'});
        return;
      }

      const result = await client.query<Task>(`
        SELECT t.*,
               tm.status                  as monitoring_status,
               tm.status_message,
               tm.progress_percentage,
               tm.items_total,
               tm.items_completed,
               tm.items_failed,
               ts.total_vods,
               ts.successful_downloads,
               ts.failed_downloads,
               ts.total_storage_bytes,
               ts.avg_download_speed,
               tpm.execution_time,
               tpm.success_rate,
               tpm.failure_rate,
               COALESCE(
                   jsonb_build_object(
                       'percentage', COALESCE(tm.progress_percentage, 0),
                       'message', tm.status_message,
                       'status', tm.status,
                       'stats', jsonb_build_object(
                           'total', COALESCE(tm.items_total, 0),
                           'completed', COALESCE(tm.items_completed, 0),
                           'failed', COALESCE(tm.items_failed, 0)
                         )
                     ),
                   jsonb_build_object(
                       'percentage', 0,
                       'message', null,
                       'status', 'created',
                       'stats', null
                     )
                 )                        as progress,
               (SELECT jsonb_agg(
                           jsonb_build_object(
                               'language', vls.language,
                               'count', vls.vod_count
                             )
                         )
                FROM vod_language_stats vls
                WHERE vls.task_id = t.id) as language_stats
        FROM tasks t
               LEFT JOIN task_monitoring tm ON t.id = tm.task_id
               LEFT JOIN task_statistics ts ON t.id = ts.task_id
               LEFT JOIN LATERAL(
          SELECT *
          FROM task_performance_metrics
          WHERE task_id = t.id
          ORDER BY measured_at DESC
          LIMIT 1
        ) tpm ON true
        WHERE t.id = $1
          AND t.user_id = $2
      `, [taskId, userId]);

      if (result.rows.length === 0) {
        res.status(404).json({error: 'Task not found'});
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error fetching task:', error);
      res.status(500).json({error: 'Failed to fetch task'});
    } finally {
      client.release();
    }
  }

  async createTask(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({error: 'User not authenticated'});
        return;
      }

      const taskData = req.body;

      await client.query('BEGIN');

      try {
        // Insert task
        const dbResult = await client.query(`
          INSERT INTO tasks (name,
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
                             monitoring_enabled,
                             alert_thresholds,
                             created_at,
                             updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::task_priority_level, $13, 'pending', $14, $15, $16,
                  $17, NOW(), NOW())
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
          taskData.restrictions || {},
          taskData.monitoring_enabled !== false,
          taskData.alert_thresholds || {
            errorRate: 20,
            storageUsage: 85,
            executionTime: 3600,
            warningThreshold: 5,
            criticalThreshold: 10
          }
        ]);

        const taskId = dbResult.rows[0].id;

        // Initialize task statistics
        await client.query(`
          INSERT INTO task_statistics (task_id,
                                       created_at,
                                       updated_at)
          VALUES ($1, NOW(), NOW())
        `, [taskId]);

        await client.query('COMMIT');

        // Fetch complete task data
        const taskResult = await client.query(`
          SELECT t.*,
                 tm.status as monitoring_status,
                 tm.status_message,
                 tm.progress_percentage,
                 tm.items_total,
                 tm.items_completed,
                 ts.total_vods,
                 ts.successful_downloads,
                 jsonb_build_object(
                     'percentage', COALESCE(tm.progress_percentage, 0),
                     'status_message', tm.status_message,
                     'current_progress', jsonb_build_object(
                         'completed', COALESCE(tm.items_completed, 0),
                         'total', COALESCE(tm.items_total, 0)
                       )
                   )       as progress
          FROM tasks t
                 LEFT JOIN task_monitoring tm ON t.id = tm.task_id
                 LEFT JOIN task_statistics ts ON t.id = ts.task_id
          WHERE t.id = $1
        `, [taskId]);

        logger.info('Task created successfully', {
          taskId,
          taskType: taskData.task_type,
          taskData: taskResult.rows[0]
        });

        res.status(201).json(taskResult.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error creating task:', error);
      res.status(500).json({error: 'Failed to create task'});
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
        res.status(401).json({error: 'User not authenticated'});
        return;
      }

      // Check if task exists and belongs to user
      const taskCheck = await client.query(
          'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
          [taskId, userId]
      );

      if (taskCheck.rows.length === 0) {
        res.status(404).json({error: 'Task not found'});
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
            INSERT INTO task_monitoring (task_id,
                                         status,
                                         status_message,
                                         progress_percentage,
                                         created_at,
                                         updated_at)
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            ON CONFLICT (task_id)
              DO UPDATE SET status              = EXCLUDED.status,
                            status_message      = EXCLUDED.status_message,
                            progress_percentage = EXCLUDED.progress_percentage,
                            updated_at          = NOW()
          `, [
            taskId,
            updates.status,
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
      res.status(500).json({error: 'Failed to update task'});
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
        res.status(401).json({error: 'User not authenticated'});
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
        res.status(404).json({error: 'Task not found'});
        return;
      }

      try {
        // Due to CASCADE DELETE constraints, we only need to delete the task
        await client.query(
            'DELETE FROM tasks WHERE id = $1 AND user_id = $2',
            [taskId, userId]
        );

        await client.query('COMMIT');
        logger.info(`Successfully deleted task ${taskId} and all related data`);
        res.json({message: 'Task deleted successfully'});
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
        res.status(401).json({error: 'User not authenticated'});
        return;
      }

      // Verify task belongs to user
      const taskCheck = await client.query(
          'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
          [taskId, userId]
      );

      if (taskCheck.rows.length === 0) {
        res.status(404).json({error: 'Task not found'});
        return;
      }

      const result = await client.query(`
        SELECT th.*,
               tpm.execution_time,
               tpm.success_rate,
               tpm.failure_rate,
               tpm.avg_download_speed,
               tpm.vod_count,
               tpm.storage_used,
               tpm.error_count,
               tpm.warning_count,
               (SELECT jsonb_agg(
                           jsonb_build_object(
                               'timestamp', tm.created_at,
                               'status', tm.status,
                               'message', tm.status_message,
                               'percentage', tm.progress_percentage,
                               'stats', jsonb_build_object(
                                   'total', tm.items_total,
                                   'completed', tm.items_completed,
                                   'failed', tm.items_failed
                                 )
                             ) ORDER BY tm.created_at
                         )
                FROM task_monitoring tm
                WHERE tm.task_id = th.task_id
                  AND tm.created_at BETWEEN th.start_time AND COALESCE(th.end_time, CURRENT_TIMESTAMP)) as monitoring_updates,
               (SELECT jsonb_agg(
                           jsonb_build_object(
                               'language', vls.language,
                               'count', vls.vod_count
                             )
                         )
                FROM vod_language_stats vls
                WHERE vls.task_id = th.task_id)                                                         as language_stats
        FROM task_history th
               LEFT JOIN task_performance_metrics tpm
                         ON tpm.task_id = th.task_id
                           AND tpm.measured_at BETWEEN th.start_time AND COALESCE(th.end_time, CURRENT_TIMESTAMP)
        WHERE th.task_id = $1
        ORDER BY th.created_at DESC
        LIMIT $2
      `, [taskId, limit]);

      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching task history:', error);
      res.status(500).json({error: 'Failed to fetch task history'});
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
        res.status(401).json({error: 'User not authenticated'});
        return;
      }

      const result = await client.query(`
        SELECT t.*,
               tm.status                  as monitoring_status,
               tm.status_message,
               tm.progress_percentage,
               tm.items_total,
               tm.items_completed,
               tm.items_failed,
               tm.last_check_at,
               ts.total_vods,
               ts.successful_downloads,
               ts.failed_downloads,
               ts.total_storage_bytes,
               ts.avg_download_speed,
               ts.last_execution_time,
               ts.total_executions,
               COALESCE(
                   jsonb_build_object(
                       'percentage', COALESCE(tm.progress_percentage, 0),
                       'message', tm.status_message,
                       'status', tm.status,
                       'lastCheck', tm.last_check_at,
                       'stats', jsonb_build_object(
                           'total', tm.items_total,
                           'completed', tm.items_completed,
                           'failed', tm.items_failed
                         )
                     ),
                   jsonb_build_object(
                       'percentage', 0,
                       'message', null,
                       'status', 'created',
                       'stats', null
                     )
                 )                        as monitoring_status,
               (SELECT jsonb_agg(
                           jsonb_build_object(
                               'language', vls.language,
                               'count', vls.vod_count
                             )
                         )
                FROM vod_language_stats vls
                WHERE vls.task_id = t.id) as language_stats,
               (SELECT jsonb_agg(
                           jsonb_build_object(
                               'execution_time', tpm.execution_time,
                               'success_rate', tpm.success_rate,
                               'failure_rate', tpm.failure_rate,
                               'avg_download_speed', tpm.avg_download_speed,
                               'vod_count', tpm.vod_count,
                               'storage_used', tpm.storage_used,
                               'error_count', tpm.error_count,
                               'warning_count', tpm.warning_count,
                               'measured_at', tpm.measured_at
                             ) ORDER BY tpm.measured_at DESC
                         )
                FROM task_performance_metrics tpm
                WHERE tpm.task_id = t.id
                LIMIT 10)                 as performance_history
        FROM tasks t
               LEFT JOIN task_monitoring tm ON t.id = tm.task_id
               LEFT JOIN task_statistics ts ON t.id = ts.task_id
        WHERE t.id = $1
          AND t.user_id = $2
      `, [taskId, userId]);

      if (result.rows.length === 0) {
        res.status(404).json({error: 'Task not found'});
        return;
      }

      const taskDetails = result.rows[0];

      // Get task manager details if available
      const managerDetails = await this.downloadManager.getTaskDetails(taskId);

      const response = {
        ...taskDetails,
        ...managerDetails
      };

      res.json(response);
    } catch (error) {
      logger.error('Error fetching task details:', error);
      res.status(500).json({error: 'Failed to fetch task details'});
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

      await client.query('BEGIN');

      try {
        // First, reset any stale monitoring states
        await client.query(`
          UPDATE task_monitoring
          SET status = 'completed',
              updated_at = NOW()
          WHERE task_id = $1 
          AND status = 'running' 
          AND updated_at < NOW() - INTERVAL '1 hour'
        `, [taskId]);

        // Get task with its current state
        const taskCheck = await client.query(`
          SELECT 
            t.*,
            tm.status as monitoring_status,
            tm.updated_at as monitoring_updated_at
          FROM tasks t
          LEFT JOIN task_monitoring tm ON t.id = tm.task_id
          WHERE t.id = $1 AND t.user_id = $2
          FOR UPDATE OF t
        `, [taskId, userId]);

        if (taskCheck.rows.length === 0) {
          throw new Error('Task not found');
        }

        const task = taskCheck.rows[0];
        logger.debug('Current task state:', {
          taskId,
          status: task.status,
          monitoring_status: task.monitoring_status,
          last_updated: task.monitoring_updated_at
        });

        // Check if task is truly running (not stale)
        const isRunning = task.monitoring_status === 'running' &&
                         (new Date().getTime() - new Date(task.monitoring_updated_at).getTime()) < 3600000; // 1 hour

        if (isRunning) {
          await client.query('ROLLBACK');
          res.status(400).json({ error: 'Task is already running' });
          return;
        }

        // Reset task state
        await client.query(`
          UPDATE tasks
          SET status = 'running',
              error_message = NULL,
              last_run = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [taskId]);

        // Insert or update task monitoring
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
          ) VALUES ($1, 'running', 'Task started manually', 0, 0, 0, 0, NOW(), NOW(), NOW())
          ON CONFLICT (task_id) 
          DO UPDATE SET
            status = 'running',
            status_message = 'Task started manually',
            progress_percentage = 0,
            items_completed = 0,
            items_failed = 0,
            last_check_at = NOW(),
            updated_at = NOW()
        `, [taskId]);

        // Create history entry
        await client.query(`
          INSERT INTO task_history (
            task_id,
            status,
            start_time,
            details
          ) VALUES ($1, 'running', CURRENT_TIMESTAMP, $2)
        `, [taskId, {
          trigger: 'manual',
          triggered_by: userId,
          monitoring_enabled: task.monitoring_enabled,
          alert_thresholds: task.alert_thresholds
        }]);

        await client.query('COMMIT');

        // Execute task asynchronously
        this.downloadManager.executeTask(taskId).catch((error: Error) => {
          logger.error(`Error during task execution:`, error);
          this.handleTaskError(taskId, error).catch(err => {
            logger.error('Error handling task failure:', err);
          });
        });

        logger.info(`Task ${taskId} started manually by user ${userId}`, {
          monitoring_enabled: task.monitoring_enabled,
          taskState: task.status,
          monitoringStatus: task.monitoring_status
        });

        // Get updated task state
        const updatedTask = await client.query(`
          SELECT 
            t.*,
            tm.status as monitoring_status,
            tm.status_message,
            tm.progress_percentage,
            jsonb_build_object(
              'percentage', COALESCE(tm.progress_percentage, 0),
              'message', tm.status_message,
              'current_progress', jsonb_build_object(
                'completed', COALESCE(tm.items_completed, 0),
                'total', COALESCE(tm.items_total, 0)
              )
            ) as progress
          FROM tasks t
          LEFT JOIN task_monitoring tm ON t.id = tm.task_id
          WHERE t.id = $1
        `, [taskId]);

        res.json(updatedTask.rows[0]);

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error running task:', error);
      res.status(500).json({
        error: 'Failed to run task',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      client.release();
    }
  }

  private async handleTaskError(taskId: number, error: Error) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update task monitoring status
      await client.query(`
        UPDATE task_monitoring
        SET status = 'failed',
            status_message = $2,
            updated_at = NOW()
        WHERE task_id = $1
      `, [taskId, error.message]);

      // Update task status
      await client.query(`
        UPDATE tasks
        SET status = 'failed',
            error_message = $2,
            updated_at = NOW()
        WHERE id = $1
      `, [taskId, error.message]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async batchUpdateTasks(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({error: 'User not authenticated'});
        return;
      }

      const {task_ids, updates} = req.body;

      if (!Array.isArray(task_ids) || task_ids.length === 0) {
        res.status(400).json({error: 'No task IDs provided'});
        return;
      }

      await client.query('BEGIN');

      try {
        // Verify all tasks belong to user
        const taskCheck = await client.query(`
          SELECT COUNT(*) as count
          FROM tasks
          WHERE id = ANY($1)
            AND user_id = $2
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

        // Update monitoring entries if status changed
        if (updates.status) {
          await Promise.all(task_ids.map(taskId =>
              client.query(`
                INSERT INTO task_monitoring (task_id,
                                             status,
                                             status_message,
                                             progress_percentage,
                                             last_check_at,
                                             created_at,
                                             updated_at)
                VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
                ON CONFLICT (task_id)
                  DO UPDATE SET status              = EXCLUDED.status,
                                status_message      = EXCLUDED.status_message,
                                progress_percentage = EXCLUDED.progress_percentage,
                                last_check_at       = NOW(),
                                updated_at          = NOW()
              `, [
                taskId,
                updates.status,
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
      res.status(500).json({error: 'Failed to update tasks'});
    } finally {
      client.release();
    }
  }

  async batchDeleteTasks(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({error: 'User not authenticated'});
        return;
      }

      const {task_ids} = req.body;

      if (!Array.isArray(task_ids) || task_ids.length === 0) {
        res.status(400).json({error: 'No task IDs provided'});
        return;
      }

      await client.query('BEGIN');

      try {
        // Verify all tasks belong to user
        const taskCheck = await client.query(`
          SELECT COUNT(*) as count
          FROM tasks
          WHERE id = ANY($1)
            AND user_id = $2
        `, [task_ids, userId]);

        if (taskCheck.rows[0].count !== task_ids.length) {
          throw new Error('One or more tasks not found or access denied');
        }

        // Due to CASCADE DELETE constraints, we only need to delete the tasks
        await client.query(
            'DELETE FROM tasks WHERE id = ANY($1) AND user_id = $2',
            [task_ids, userId]
        );

        await client.query('COMMIT');
        res.json({message: 'Tasks deleted successfully'});
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error deleting tasks:', error);
      res.status(500).json({
        error: 'Failed to delete tasks',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      client.release();
    }
  }

  async getTaskStatistics(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);

      if (!userId) {
        res.status(401).json({error: 'User not authenticated'});
        return;
      }

      const result = await client.query(`
        SELECT ts.*,
               (SELECT jsonb_agg(
                           jsonb_build_object(
                               'language', vls.language,
                               'count', vls.vod_count,
                               'updated_at', vls.updated_at
                             )
                         )
                FROM vod_language_stats vls
                WHERE vls.task_id = ts.task_id) as language_stats,
               (SELECT jsonb_agg(
                           jsonb_build_object(
                               'execution_time', tpm.execution_time,
                               'success_rate', tpm.success_rate,
                               'failure_rate', tpm.failure_rate,
                               'avg_download_speed', tpm.avg_download_speed,
                               'vod_count', tpm.vod_count,
                               'storage_used', tpm.storage_used,
                               'error_count', tpm.error_count,
                               'warning_count', tpm.warning_count,
                               'measured_at', tpm.measured_at
                             ) ORDER BY tpm.measured_at DESC
              LIMIT 30
                         )
                FROM task_performance_metrics tpm
                WHERE tpm.task_id = ts.task_id) as performance_history
        FROM task_statistics ts
               INNER JOIN tasks t ON t.id = ts.task_id
        WHERE ts.task_id = $1
          AND t.user_id = $2
      `, [taskId, userId]);

      if (result.rows.length === 0) {
        res.status(404).json({error: 'Task statistics not found'});
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error fetching task statistics:', error);
      res.status(500).json({error: 'Failed to fetch task statistics'});
    } finally {
      client.release();
    }
  }

  async getTaskPerformanceMetrics(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const taskId = parseInt(req.params.id);
      const period = req.query.period || '24h';

      if (!userId) {
        res.status(401).json({error: 'User not authenticated'});
        return;
      }

      let timeInterval: string;
      switch (period) {
        case '7d':
          timeInterval = 'INTERVAL \'7 days\'';
          break;
        case '30d':
          timeInterval = 'INTERVAL \'30 days\'';
          break;
        case '24h':
        default:
          timeInterval = 'INTERVAL \'24 hours\'';
          break;
      }

      const result = await client.query(`
        SELECT tpm.*,
               t.monitoring_enabled,
               t.alert_thresholds
        FROM task_performance_metrics tpm
               INNER JOIN tasks t ON t.id = tpm.task_id
        WHERE tpm.task_id = $1
          AND t.user_id = $2
          AND tpm.measured_at >= NOW() - ${timeInterval}
        ORDER BY tpm.measured_at DESC
      `, [taskId, userId]);

      if (result.rows.length === 0) {
        res.status(404).json({error: 'No performance metrics found for the specified period'});
        return;
      }

      const metrics = {
        taskId,
        period,
        data: result.rows,
        summary: {
          avg_execution_time: result.rows.reduce((acc, curr) => acc + curr.execution_time, 0) / result.rows.length,
          avg_success_rate: result.rows.reduce((acc, curr) => acc + curr.success_rate, 0) / result.rows.length,
          total_vods: result.rows.reduce((acc, curr) => acc + curr.vod_count, 0),
          total_errors: result.rows.reduce((acc, curr) => acc + curr.error_count, 0),
          total_warnings: result.rows.reduce((acc, curr) => acc + curr.warning_count, 0),
          monitoring_enabled: result.rows[0]?.monitoring_enabled,
          alert_thresholds: result.rows[0]?.alert_thresholds
        }
      };

      res.json(metrics);
    } catch (error) {
      logger.error('Error fetching task performance metrics:', error);
      res.status(500).json({error: 'Failed to fetch task performance metrics'});
    } finally {
      client.release();
    }
  }

  private async updateTaskMonitoring(
      client: Pool,
      taskId: number,
      status: string,
      message: string,
      progress: number = 0
  ): Promise<void> {
    try {
      await client.query(`
        INSERT INTO task_monitoring (task_id,
                                     status,
                                     status_message,
                                     progress_percentage,
                                     last_check_at,
                                     created_at,
                                     updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
        ON CONFLICT (task_id)
          DO UPDATE SET status              = EXCLUDED.status,
                        status_message      = EXCLUDED.status_message,
                        progress_percentage = EXCLUDED.progress_percentage,
                        last_check_at       = NOW(),
                        updated_at          = NOW()
      `, [taskId, status, message, progress]);
    } catch (error) {
      logger.error(`Error updating task monitoring for task ${taskId}:`, error);
      throw error;
    }
  }
}

// Factory function for creating TasksController instance
export const createTasksController = (
  pool: Pool,
  downloadManager: DownloadManager
) => new TasksController(pool, downloadManager);

export default TasksController;

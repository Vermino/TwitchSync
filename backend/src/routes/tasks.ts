// Filepath: backend/src/routes/tasks.ts

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import DownloadManager from '../services/downloadManager';
import fs from 'fs/promises';
import path from 'path';

// Extend base Request type to include authenticated user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    twitch_id?: string;
  };
}

// Type for request handler to help with type inference
type AsyncRequestHandler = (req: AuthenticatedRequest, res: Response) => Promise<void | Response>;

export const setupTaskRoutes = (pool: Pool, downloadManager?: DownloadManager): Router => {
  const router = Router();

  // Helper to wrap async handlers with proper typing
  const handleAsync = (handler: AsyncRequestHandler) => {
    return async (req: Request, res: Response) => {
      try {
        await handler(req as AuthenticatedRequest, res);
      } catch (error) {
        logger.error('Task route handler error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    };
  };

  // GET / - List all tasks for the authenticated user
  router.get('/', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Get all tasks with live VOD progress data
      const result = await client.query(`
        SELECT 
          t.id,
          t.name,
          t.description,
          t.task_type,
          t.channel_ids,
          t.game_ids,
          t.schedule_type,
          t.schedule_value,
          t.storage_limit_gb,
          t.retention_days,
          t.auto_delete,
          t.is_active,
          t.priority,
          t.status,
          t.last_run,
          t.next_run,
          t.created_at,
          t.updated_at,
          tm.status as monitoring_status,
          tm.status_message,
          -- Live VOD progress calculation
          COALESCE(vod_stats.total_vods, 0) as items_total,
          COALESCE(vod_stats.completed_vods, 0) as items_completed,
          COALESCE(vod_stats.downloading_vods, 0) as items_downloading,
          COALESCE(vod_stats.failed_vods, 0) as items_failed,
          CASE 
            WHEN COALESCE(vod_stats.total_vods, 0) > 0 
            THEN ROUND((COALESCE(vod_stats.completed_vods, 0)::numeric / vod_stats.total_vods::numeric) * 100)
            ELSE 0
          END as progress_percentage,
          array_agg(DISTINCT COALESCE(c.display_name, c.username)) FILTER (WHERE c.username IS NOT NULL) as channel_names,
          array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) as game_names
        FROM tasks t
        LEFT JOIN task_monitoring tm ON t.id = tm.task_id
        LEFT JOIN channels c ON c.id = ANY(t.channel_ids)
        LEFT JOIN games g ON g.id = ANY(t.game_ids)
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) as total_vods,
            COUNT(*) FILTER (WHERE v.download_status = 'completed') as completed_vods,
            COUNT(*) FILTER (WHERE v.download_status = 'downloading') as downloading_vods,
            COUNT(*) FILTER (WHERE v.download_status = 'failed') as failed_vods
          FROM vods v
          WHERE v.task_id = t.id
        ) vod_stats ON true
        WHERE t.user_id = $1
        GROUP BY t.id, tm.status, tm.status_message,
                 vod_stats.total_vods, vod_stats.completed_vods,
                 vod_stats.downloading_vods, vod_stats.failed_vods
        ORDER BY t.priority DESC, t.created_at DESC
      `, [parseInt(userId)]);

      res.json(result.rows);
    } finally {
      client.release();
    }
  }));

  // POST / - Create a new task
  router.post('/', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const {
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
        priority
      } = req.body;

      // Validate required fields
      if (!name || !task_type || !schedule_type || !schedule_value) {
        return res.status(400).json({
          error: 'Missing required fields: name, task_type, schedule_type, schedule_value'
        });
      }

      // Validate arrays
      const channelIdsArray = Array.isArray(channel_ids) ? channel_ids : [];
      const gameIdsArray = Array.isArray(game_ids) ? game_ids : [];

      if (channelIdsArray.length === 0 && gameIdsArray.length === 0) {
        return res.status(400).json({
          error: 'At least one channel or game must be specified'
        });
      }

      // Create task with initial scheduled scan
      const result = await client.query(`
        INSERT INTO tasks (
          name, description, task_type, channel_ids, game_ids,
          schedule_type, schedule_value, storage_limit_gb, retention_days,
          auto_delete, priority, user_id, status, next_run
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', NOW() + INTERVAL '5 seconds'
        ) RETURNING *
      `, [
        name, description, task_type, channelIdsArray, gameIdsArray,
        schedule_type, schedule_value, storage_limit_gb, retention_days,
        auto_delete || false, priority || 1, parseInt(userId)
      ]);

      const task = result.rows[0];

      // Initialize monitoring record
      await client.query(`
        INSERT INTO task_monitoring (task_id, status, status_message)
        VALUES ($1, 'pending', 'Task created - first scan scheduled in 5 seconds')
      `, [task.id]);

      // Log task creation event
      await client.query(`
        INSERT INTO task_events (task_id, event_type, details)
        VALUES ($1, 'task_created', $2)
      `, [task.id, JSON.stringify({
        task_name: name,
        created_by: 'user',
        initial_scan_scheduled: true
      })]);

      logger.info(`Created new task ${task.id} "${name}" - first scan scheduled for 5 seconds`);

      res.status(201).json({
        ...task,
        message: 'Task created successfully - first scan will run in 5 seconds'
      });
    } finally {
      client.release();
    }
  }));

  // GET /:id - Get a single task by ID
  router.get('/:id', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.id);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (isNaN(taskId)) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }

      // Get task with monitoring data
      const result = await client.query(`
        SELECT 
          t.*,
          tm.status as monitoring_status,
          tm.status_message,
          tm.progress_percentage,
          tm.items_total,
          tm.items_completed,
          tm.last_check_at,
          array_agg(DISTINCT COALESCE(c.display_name, c.username)) FILTER (WHERE c.username IS NOT NULL) as channel_names,
          array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) as game_names
        FROM tasks t
        LEFT JOIN task_monitoring tm ON t.id = tm.task_id
        LEFT JOIN channels c ON c.id = ANY(t.channel_ids)
        LEFT JOIN games g ON g.id = ANY(t.game_ids)
        WHERE t.id = $1 AND t.user_id = $2
        GROUP BY t.id, tm.status, tm.status_message, tm.progress_percentage, 
                 tm.items_total, tm.items_completed, tm.last_check_at
      `, [taskId, parseInt(userId)]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  }));

  // PUT /:id - Update a task
  router.put('/:id', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.id);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (isNaN(taskId)) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }

      // Check if task exists and belongs to user
      const existingTask = await client.query(`
        SELECT id, status FROM tasks WHERE id = $1 AND user_id = $2
      `, [taskId, parseInt(userId)]);

      if (existingTask.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const {
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
        priority,
        is_active
      } = req.body;

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [taskId, parseInt(userId)];
      let paramIndex = 3;

      if (name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(name);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(description);
      }
      if (task_type !== undefined) {
        updates.push(`task_type = $${paramIndex++}`);
        values.push(task_type);
      }
      if (channel_ids !== undefined) {
        updates.push(`channel_ids = $${paramIndex++}`);
        values.push(Array.isArray(channel_ids) ? channel_ids : []);
      }
      if (game_ids !== undefined) {
        updates.push(`game_ids = $${paramIndex++}`);
        values.push(Array.isArray(game_ids) ? game_ids : []);
      }
      if (schedule_type !== undefined) {
        updates.push(`schedule_type = $${paramIndex++}`);
        values.push(schedule_type);
      }
      if (schedule_value !== undefined) {
        updates.push(`schedule_value = $${paramIndex++}`);
        values.push(schedule_value);
      }
      if (storage_limit_gb !== undefined) {
        updates.push(`storage_limit_gb = $${paramIndex++}`);
        values.push(storage_limit_gb);
      }
      if (retention_days !== undefined) {
        updates.push(`retention_days = $${paramIndex++}`);
        values.push(retention_days);
      }
      if (auto_delete !== undefined) {
        updates.push(`auto_delete = $${paramIndex++}`);
        values.push(auto_delete);
      }
      if (priority !== undefined) {
        updates.push(`priority = $${paramIndex++}`);
        values.push(priority);
      }
      if (is_active !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(is_active);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      // Add updated_at
      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      const result = await client.query(`
        UPDATE tasks 
        SET ${updates.join(', ')}
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `, values);

      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  }));

  // DELETE /:id - Delete a task
  router.delete('/:id', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.id);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (isNaN(taskId)) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }

      await client.query('BEGIN');

      // Check if task exists and belongs to user
      const existingTask = await client.query(`
        SELECT id, status FROM tasks WHERE id = $1 AND user_id = $2
      `, [taskId, parseInt(userId)]);

      if (existingTask.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Task not found' });
      }

      // Delete related monitoring data
      await client.query('DELETE FROM task_monitoring WHERE task_id = $1', [taskId]);
      await client.query('DELETE FROM task_events WHERE task_id = $1', [taskId]);
      await client.query('DELETE FROM task_skipped_vods WHERE task_id = $1', [taskId]);

      // Update VODs to remove task association rather than deleting them
      await client.query(`
        UPDATE vods SET task_id = NULL WHERE task_id = $1
      `, [taskId]);

      // Delete the task
      await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);

      await client.query('COMMIT');
      res.status(204).send();
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }));

  // POST /:id/activate - Activate/start a task
  router.post('/:id/activate', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.id);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (isNaN(taskId)) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }

      // Check if task exists, belongs to user, and is in ready state
      const taskCheck = await client.query(`
        SELECT id, status, name FROM tasks WHERE id = $1 AND user_id = $2
      `, [taskId, parseInt(userId)]);

      if (taskCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const task = taskCheck.rows[0];

      // Only allow activation for tasks in 'ready' state
      if (task.status !== 'ready') {
        return res.status(400).json({
          error: `Task cannot be activated. Current status: ${task.status}. Task must be in 'ready' state.`,
          current_status: task.status
        });
      }

      // Check if there are queued VODs to download
      const queuedVODsResult = await client.query(`
        SELECT COUNT(*) as count FROM vods WHERE task_id = $1 AND status = 'queued'
      `, [taskId]);

      const queuedCount = parseInt(queuedVODsResult.rows[0].count);
      if (queuedCount === 0) {
        return res.status(400).json({
          error: 'No queued VODs found to download. Run a scan first.',
          queued_vods: 0
        });
      }

      // Update task status to downloading
      await client.query(`
        UPDATE tasks 
        SET status = 'downloading', last_run = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [taskId]);

      // Update monitoring status
      const existingMonitoring = await client.query(`
        SELECT id FROM task_monitoring WHERE task_id = $1 LIMIT 1
      `, [taskId]);

      if (existingMonitoring.rows.length > 0) {
        await client.query(`
          UPDATE task_monitoring 
          SET status = 'downloading', 
              status_message = 'Starting downloads...',
              items_total = $2,
              items_completed = 0,
              progress_percentage = 0,
              updated_at = CURRENT_TIMESTAMP
          WHERE task_id = $1
        `, [taskId, queuedCount]);
      } else {
        await client.query(`
          INSERT INTO task_monitoring (task_id, status, status_message, items_total, items_completed, progress_percentage, updated_at)
          VALUES ($1, 'downloading', 'Starting downloads...', $2, 0, 0, CURRENT_TIMESTAMP)
        `, [taskId, queuedCount]);
      }

      // Log task activation event
      await client.query(`
        INSERT INTO task_events (task_id, event_type, details)
        VALUES ($1, 'activated', $2)
      `, [taskId, JSON.stringify({ task_name: task.name, activated_by: 'user' })]);

      // Trigger task activation (start downloads) via download manager if available
      if (downloadManager) {
        try {
          await downloadManager.executeTask(taskId, 'activate');
          logger.info(`Task ${taskId} activation triggered via download manager`);
        } catch (dmError) {
          logger.warn(`Failed to trigger task activation via download manager:`, dmError);
          // Don't fail the request if download manager execution fails
        }
      }

      res.json({
        message: 'Task activated successfully',
        task_id: taskId,
        status: 'downloading',
        queued_vods: queuedCount
      });
    } finally {
      client.release();
    }
  }));

  // POST /:id/scan - Manually trigger VOD scan for a task
  router.post('/:id/scan', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.id);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (isNaN(taskId)) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }

      // Check if task exists, belongs to user, and is not currently running
      const taskCheck = await client.query(`
        SELECT id, status, name FROM tasks WHERE id = $1 AND user_id = $2
      `, [taskId, parseInt(userId)]);

      if (taskCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const task = taskCheck.rows[0];

      // Don't allow scanning if task is currently downloading
      if (task.status === 'downloading') {
        return res.status(400).json({
          error: `Task cannot be scanned while downloading. Current status: ${task.status}`,
          current_status: task.status
        });
      }

      // Update task status to scanning
      await client.query(`
        UPDATE tasks 
        SET status = 'running', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [taskId]);

      // Update monitoring status
      const existingMonitoring = await client.query(`
        SELECT id FROM task_monitoring WHERE task_id = $1 LIMIT 1
      `, [taskId]);

      if (existingMonitoring.rows.length > 0) {
        await client.query(`
          UPDATE task_monitoring 
          SET status = 'scanning', 
              status_message = 'Manual VOD scan requested...',
              updated_at = CURRENT_TIMESTAMP
          WHERE task_id = $1
        `, [taskId]);
      } else {
        await client.query(`
          INSERT INTO task_monitoring (task_id, status, status_message, updated_at)
          VALUES ($1, 'scanning', 'Manual VOD scan requested...', CURRENT_TIMESTAMP)
        `, [taskId]);
      }

      // Log task scan event
      await client.query(`
        INSERT INTO task_events (task_id, event_type, details)
        VALUES ($1, 'scan_requested', $2)
      `, [taskId, JSON.stringify({ task_name: task.name, triggered_by: 'user' })]);

      // Trigger task scanning via download manager if available
      if (downloadManager) {
        try {
          await downloadManager.executeTask(taskId, 'scan');
          logger.info(`Task ${taskId} scan triggered via download manager`);
        } catch (dmError) {
          logger.warn(`Failed to trigger task scan via download manager:`, dmError);
          // Don't fail the request if download manager execution fails
        }
      }

      res.json({
        message: 'VOD scan started successfully',
        task_id: taskId,
        status: 'scanning'
      });
    } finally {
      client.release();
    }
  }));

  // POST /:id/status/pause - Pause a task
  router.post('/:id/status/pause', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.id);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (isNaN(taskId)) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }

      await client.query('BEGIN');

      const taskResult = await client.query(`
        SELECT id, status FROM tasks WHERE id = $1 AND user_id = $2
      `, [taskId, parseInt(userId)]);

      if (taskResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Task not found' });
      }

      const task = taskResult.rows[0];

      await client.query(`
        UPDATE tasks 
        SET status = 'paused'::task_status, is_active = false, last_paused_at = NOW(), updated_at = NOW() 
        WHERE id = $1
      `, [taskId]);

      await client.query(`
        UPDATE task_monitoring 
        SET status = 'paused', status_message = 'Task paused by user', updated_at = NOW() 
        WHERE task_id = $1
      `, [taskId]);

      await client.query(`
        INSERT INTO task_events (task_id, event_type, details, created_at) 
        VALUES ($1, 'status_change', $2, NOW())
      `, [taskId, JSON.stringify({ previous_status: task.status, new_status: 'paused', reason: 'user_pause' })]);

      // Pause queued/downloading VODs in the database
      if (downloadManager) {
        const activeDownloads = downloadManager.getActiveDownloads();
        for (const [vodId, downloadState] of Array.from(activeDownloads.entries())) {
          await client.query(`
             UPDATE vods 
             SET resume_segment_index = $1, download_status = 'paused', pause_reason = 'task_paused', paused_at = NOW(), updated_at = NOW()
             WHERE id = $2 AND task_id = $3
           `, [downloadState.progress?.segmentIndex || 0, vodId, taskId]);
        }
      }

      await client.query(`
        UPDATE vods 
        SET download_status = 'paused', pause_reason = 'task_paused', paused_at = NOW(), updated_at = NOW()
        WHERE task_id = $1 AND download_status IN ('downloading', 'queued')
      `, [taskId]);

      await client.query('COMMIT');

      // Stop download processing for this task
      if (downloadManager) {
        // downloadManager.stopProcessing stops ALL downloads. To pause a single task effectively, 
        // the QueueProcessor will naturally skip it on next tick since status is 'paused'.
        // For currently active segments, they will finish, but the next segment will see status 'paused' and abort.
      }

      res.json({ message: 'Task paused successfully' });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error pausing task:', error);
      res.status(500).json({ error: 'Failed to pause task' });
    } finally {
      client.release();
    }
  }));

  // POST /:id/status/resume - Resume a task
  router.post('/:id/status/resume', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.id);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (isNaN(taskId)) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }

      await client.query('BEGIN');

      const taskResult = await client.query(`
        SELECT id FROM tasks WHERE id = $1 AND user_id = $2
      `, [taskId, parseInt(userId)]);

      if (taskResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Task not found' });
      }

      await client.query(`
        UPDATE tasks 
        SET status = 'running'::task_status, is_active = true, last_resumed_at = NOW(), updated_at = NOW() 
        WHERE id = $1
      `, [taskId]);

      await client.query(`SELECT resume_task_downloads($1)`, [taskId]);

      await client.query(`
        UPDATE task_monitoring 
        SET status = 'running', status_message = 'Task resumed by user', updated_at = NOW() 
        WHERE task_id = $1
      `, [taskId]);

      await client.query(`
        INSERT INTO task_events (task_id, event_type, details, created_at) 
        VALUES ($1, 'status_change', $2, NOW())
      `, [taskId, JSON.stringify({ previous_status: 'paused', new_status: 'running', reason: 'user_resume' })]);

      await client.query('COMMIT');

      if (downloadManager) {
        setImmediate(() => {
          downloadManager.executeTask(taskId, 'activate').catch(err => {
            logger.error(`Error resuming task downloads:`, err);
          });
        });
      }

      res.json({ message: 'Task resumed successfully' });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error resuming task:', error);
      res.status(500).json({ error: 'Failed to resume task' });
    } finally {
      client.release();
    }
  }));

  // Get task details with VOD discovery information
  router.get('/:taskId/details', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.taskId);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Get task details
      const taskResult = await client.query(`
        SELECT 
          t.id,
          t.name,
          t.status,
          t.priority,
          t.created_at,
          t.last_run,
          tm.status_message,
          tm.progress_percentage,
          tm.items_total,
          tm.items_completed,
          array_agg(DISTINCT COALESCE(c.display_name, c.username)) as channel_names,
          array_agg(DISTINCT g.name) as game_names
        FROM tasks t
        LEFT JOIN task_monitoring tm ON t.id = tm.task_id
        LEFT JOIN channels c ON c.id = ANY(t.channel_ids)
        LEFT JOIN games g ON g.id = ANY(t.game_ids)
        WHERE t.id = $1 AND t.user_id = $2
        GROUP BY t.id, tm.status_message, tm.progress_percentage, tm.items_total, tm.items_completed
      `, [taskId, parseInt(userId)]);

      if (taskResult.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const task = taskResult.rows[0];

      // Get queued VODs count
      const queuedVodsResult = await client.query(`
        SELECT COUNT(*) as queued_count
        FROM vods 
        WHERE task_id = $1 AND status = 'queued'
      `, [taskId]);

      // Get completed VODs count  
      const completedVodsResult = await client.query(`
        SELECT COUNT(*) as completed_count
        FROM vods 
        WHERE task_id = $1 AND download_status = 'completed'
      `, [taskId]);

      // Get failed VODs count
      const failedVodsResult = await client.query(`
        SELECT COUNT(*) as failed_count
        FROM vods 
        WHERE task_id = $1 AND download_status = 'failed'
      `, [taskId]);

      res.json({
        ...task,
        vod_stats: {
          queued: parseInt(queuedVodsResult.rows[0].queued_count),
          completed: parseInt(completedVodsResult.rows[0].completed_count),
          failed: parseInt(failedVodsResult.rows[0].failed_count)
        }
      });
    } finally {
      client.release();
    }
  }));

  // Get filtered/skipped VODs for a task
  router.get('/:taskId/filtered-vods', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.taskId);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Verify task ownership
      const taskCheck = await client.query(`
        SELECT id FROM tasks WHERE id = $1 AND user_id = $2
      `, [taskId, parseInt(userId)]);

      if (taskCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Get skipped/filtered VODs
      const result = await client.query(`
        SELECT 
          tsv.vod_id,
          tsv.reason,
          tsv.error_message,
          tsv.created_at,
          CASE 
            WHEN tsv.reason = 'GAME_FILTER' THEN 
              CAST(tsv.error_message AS JSON)
            ELSE NULL
          END as filter_details
        FROM task_skipped_vods tsv
        WHERE tsv.task_id = $1
        ORDER BY 
          CASE tsv.reason
            WHEN 'GAME_FILTER' THEN 1
            WHEN 'VOD_NOT_FOUND' THEN 2 
            WHEN 'ERROR' THEN 3
            ELSE 4
          END,
          tsv.created_at DESC
        LIMIT 100
      `, [taskId]);

      const summary = await client.query(`
        SELECT 
          reason,
          COUNT(*) as count
        FROM task_skipped_vods 
        WHERE task_id = $1
        GROUP BY reason
        ORDER BY count DESC
      `, [taskId]);

      res.json({
        task_id: taskId,
        skipped_vods: result.rows,
        summary: summary.rows.reduce((acc: any, row: any) => {
          acc[row.reason.toLowerCase()] = parseInt(row.count);
          return acc;
        }, {})
      });
    } finally {
      client.release();
    }
  }));

  // Get task execution logs
  router.get('/:taskId/logs', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.taskId);
      const userId = req.user?.id;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Verify task ownership
      const taskCheck = await client.query(`
        SELECT id FROM tasks WHERE id = $1 AND user_id = $2
      `, [taskId, parseInt(userId)]);

      if (taskCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Get task events/logs
      const result = await client.query(`
        SELECT 
          te.event_type,
          te.details,
          te.created_at
        FROM task_events te
        WHERE te.task_id = $1
        ORDER BY te.created_at DESC
        LIMIT $2
      `, [taskId, limit]);

      res.json({
        task_id: taskId,
        events: result.rows
      });
    } finally {
      client.release();
    }
  }));

  // Get task monitoring information
  router.get('/:taskId/monitoring', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.taskId);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Verify task ownership and get monitoring data
      const result = await client.query(`
        SELECT 
          t.id,
          t.name,
          t.status as task_status,
          tm.status,
          tm.status_message,
          tm.progress_percentage,
          tm.items_total,
          tm.items_completed,
          tm.last_check_at,
          tm.updated_at,
          t.last_run,
          t.next_run
        FROM tasks t
        LEFT JOIN task_monitoring tm ON t.id = tm.task_id
        WHERE t.id = $1 AND t.user_id = $2
      `, [taskId, parseInt(userId)]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json(result.rows[0]);
    } finally {
      client.release();
    }
  }));

  // POST /scheduler/toggle - Toggle task scheduler on/off
  router.post('/scheduler/toggle', authenticate(pool), handleAsync(async (req, res) => {
    try {
      // Get current scheduler status
      const currentStatus = (global as any).taskScheduler?.getStatus();
      const isCurrentlyRunning = currentStatus?.isRunning || false;

      // Toggle scheduler
      if (isCurrentlyRunning) {
        (global as any).taskScheduler?.stop();
        logger.info('Task scheduler stopped by user');
        res.json({
          enabled: false,
          message: 'Task scheduler stopped successfully'
        });
      } else {
        (global as any).taskScheduler?.start();
        logger.info('Task scheduler started by user');
        res.json({
          enabled: true,
          message: 'Task scheduler started successfully'
        });
      }
    } catch (error) {
      logger.error('Error toggling task scheduler:', error);
      res.status(500).json({ error: 'Failed to toggle task scheduler' });
    }
  }));

  // GET /scheduler/status - Get current scheduler status
  router.get('/scheduler/status', authenticate(pool), handleAsync(async (req, res) => {
    try {
      const status = (global as any).taskScheduler?.getStatus() || { isRunning: false };
      res.json({
        enabled: status.isRunning || false,
        intervalMs: status.intervalMs || 60000
      });
    } catch (error) {
      logger.error('Error getting scheduler status:', error);
      res.status(500).json({ error: 'Failed to get scheduler status' });
    }
  }));

  // GET /:taskId/status - Get task status with available actions
  router.get('/:taskId/status', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.taskId);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Get task with comprehensive status
      const taskResult = await client.query(`
        SELECT 
          t.id,
          t.name,
          t.status,
          t.last_run,
          t.next_run,
          t.is_active,
          tm.status_message,
          tm.progress_percentage,
          tm.items_total,
          tm.items_completed
        FROM tasks t
        LEFT JOIN task_monitoring tm ON t.id = tm.task_id
        WHERE t.id = $1 AND t.user_id = $2
      `, [taskId, parseInt(userId)]);

      if (taskResult.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const task = taskResult.rows[0];

      // Get VOD counts
      const vodStatsResult = await client.query(`
        SELECT 
          COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued_vods,
          COUNT(CASE WHEN download_status = 'downloading' THEN 1 END) as downloading_vods,
          COUNT(CASE WHEN download_status = 'completed' THEN 1 END) as completed_vods,
          COUNT(CASE WHEN download_status = 'failed' THEN 1 END) as failed_vods,
          COUNT(*) as total_vods
        FROM vods 
        WHERE task_id = $1
      `, [taskId]);

      const vodStats = vodStatsResult.rows[0];

      // Determine available actions based on current state
      const availableActions = [];
      const currentStatus = task.status;

      switch (currentStatus) {
        case 'pending':
          availableActions.push('scan'); // Manual scan
          break;
        case 'ready':
          availableActions.push('activate', 'scan'); // Can activate downloads or re-scan
          break;
        case 'running':
          // Currently scanning, no actions available
          break;
        case 'scanning':
          // Currently scanning, no actions available  
          break;
        case 'downloading':
          // Currently downloading, could add pause/cancel later
          break;
        case 'completed':
          availableActions.push('scan'); // Can re-scan for new VODs
          break;
        case 'completed_with_errors':
          availableActions.push('scan'); // Can re-scan for new VODs
          break;
        case 'failed':
          availableActions.push('scan'); // Can retry scanning
          break;
      }

      // Calculate next scheduled scan time
      let nextScheduledScan = null;
      if (task.next_run) {
        const nextRun = new Date(task.next_run);
        const now = new Date();
        const msUntilRun = nextRun.getTime() - now.getTime();
        nextScheduledScan = {
          scheduled_at: task.next_run,
          minutes_until: Math.max(0, Math.round(msUntilRun / (1000 * 60))),
          is_overdue: msUntilRun < 0
        };
      }

      res.json({
        task: {
          id: task.id,
          name: task.name,
          status: currentStatus,
          is_active: task.is_active,
          last_run: task.last_run,
          status_message: task.status_message,
          progress_percentage: task.progress_percentage || 0
        },
        vod_stats: {
          queued: parseInt(vodStats.queued_vods) || 0,
          downloading: parseInt(vodStats.downloading_vods) || 0,
          completed: parseInt(vodStats.completed_vods) || 0,
          failed: parseInt(vodStats.failed_vods) || 0,
          total: parseInt(vodStats.total_vods) || 0
        },
        available_actions: availableActions,
        next_scheduled_scan: nextScheduledScan,
        can_activate: availableActions.includes('activate'),
        can_scan: availableActions.includes('scan')
      });
    } finally {
      client.release();
    }
  }));

  // GET /:id/delete-info - Get statistics about what will be deleted
  router.get('/:id/delete-info', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.id);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Verify task ownership
      const taskResult = await client.query('SELECT id, name FROM tasks WHERE id = $1 AND user_id = $2', [taskId, parseInt(userId)]);
      if (taskResult.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Calculate what will be deleted
      let fileCount = 0;
      let totalBytes = 0;
      let queuedCount = 0;

      const statsResult = await client.query(`
        SELECT 
          COUNT(*) as total_vods,
          COUNT(CASE WHEN download_status IN ('completed', 'failed', 'downloading') THEN 1 END) as files_to_delete,
          SUM(CASE WHEN download_status IN ('completed', 'failed', 'downloading') THEN file_size ELSE 0 END) as space_to_free,
          COUNT(CASE WHEN download_status = 'queued' THEN 1 END) as queued_vods
        FROM vods 
        WHERE task_id = $1
      `, [taskId]);

      if (statsResult.rows.length > 0) {
        const stats = statsResult.rows[0];
        fileCount = parseInt(stats.files_to_delete) || 0;
        totalBytes = parseInt(stats.space_to_free) || 0;
        queuedCount = parseInt(stats.queued_vods) || 0;
      }

      // Also check completed_vods explicitly
      const completedStats = await client.query(`
        SELECT COUNT(*) as count, SUM(file_size_bytes) as size 
        FROM completed_vods 
        WHERE task_id = $1
      `, [taskId]);

      if (completedStats.rows.length > 0) {
        fileCount += parseInt(completedStats.rows[0].count) || 0;
        totalBytes += parseInt(completedStats.rows[0].size) || 0;
      }

      res.json({
        files_to_delete: fileCount,
        freed_bytes: totalBytes,
        queued_vods: queuedCount,
        task_name: taskResult.rows[0].name
      });
    } catch (error) {
      logger.error(`Error getting delete info for task ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to get delete info' });
    } finally {
      client.release();
    }
  }));

  // DELETE /:id - Delete a task and all associated data/files
  router.delete('/:id', authenticate(pool), handleAsync(async (req, res) => {
    const client = await pool.connect();
    try {
      const taskId = parseInt(req.params.id);
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // 1. Verify task ownership
      const taskResult = await client.query('SELECT id, name FROM tasks WHERE id = $1 AND user_id = $2', [taskId, parseInt(userId)]);
      if (taskResult.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const taskName = taskResult.rows[0].name;
      logger.info(`Starting deletion of task ${taskId} (${taskName})`);

      // 2. Stop active downloads
      if (downloadManager) {
        const downloadingVods = await client.query('SELECT id FROM vods WHERE task_id = $1 AND download_status = $2', [taskId, 'downloading']);
        for (const vod of downloadingVods.rows) {
          try {
            await downloadManager.cancelDownload(vod.id);
            logger.info(`Cancelled active download for VOD ${vod.id} during task deletion`);
          } catch (cancelErr) {
            logger.error(`Error cancelling VOD ${vod.id} during task deletion:`, cancelErr);
          }
        }
      }

      // 3. Collect file paths to delete
      const filesToDelete = new Set<string>();
      let spaceFreed = 0;

      // From vods (in-progress/failed/completed)
      const vodFilesResult = await client.query('SELECT download_path, file_size FROM vods WHERE task_id = $1 AND download_path IS NOT NULL', [taskId]);
      vodFilesResult.rows.forEach(row => {
        filesToDelete.add(row.download_path);
        if (row.file_size) spaceFreed += parseInt(row.file_size) || 0;
      });

      // From completed_vods
      const completedFilesResult = await client.query('SELECT file_path, file_size_bytes FROM completed_vods WHERE task_id = $1 AND file_path IS NOT NULL', [taskId]);
      completedFilesResult.rows.forEach(row => {
        filesToDelete.add(row.file_path);
        if (row.file_size_bytes) spaceFreed += parseInt(row.file_size_bytes) || 0;
      });

      // Delete files from disk
      let deletedCount = 0;
      for (const filePath of filesToDelete) {
        try {
          await fs.unlink(filePath);
          deletedCount++;
        } catch (fileErr: any) {
          // Ignore ENOENT (file already gone), log others
          if (fileErr.code !== 'ENOENT') {
            logger.warn(`Could not delete file ${filePath} during task deletion: ${fileErr.message}`);
          }
        }
      }

      // 4. Cascade delete DB records inside a transaction
      await client.query('BEGIN');

      const tablesToDelete = [
        'completed_vods',
        'vod_file_states',
        'vod_retention_policies',
        'vod_language_stats',
        'task_skipped_vods',
        'task_events',
        'task_monitoring',
        'task_statistics',
        'task_performance_metrics',
        'task_history',
        'vods'
      ];

      for (const table of tablesToDelete) {
        await client.query(`DELETE FROM ${table} WHERE task_id = $1`, [taskId]);
      }

      // Finally delete the task
      await client.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [taskId, parseInt(userId)]);

      await client.query('COMMIT');

      logger.info(`Successfully deleted task ${taskId}. Removed ${deletedCount} files, freed ~${Math.round(spaceFreed / (1024 * 1024))} MB.`);

      res.json({
        success: true,
        message: `Task ${taskName} deleted successfully`,
        stats: {
          deleted_files: deletedCount,
          freed_bytes: spaceFreed
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error deleting task ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to delete task' });
    } finally {
      client.release();
    }
  }));

  return router;
};

export default setupTaskRoutes;
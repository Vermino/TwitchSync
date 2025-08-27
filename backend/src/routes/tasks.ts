// Filepath: backend/src/routes/tasks.ts

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

// Extend base Request type to include authenticated user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    twitch_id?: string;
  };
}

// Type for request handler to help with type inference
type AsyncRequestHandler = (req: AuthenticatedRequest, res: Response) => Promise<void | Response>;

export const setupTaskRoutes = (pool: Pool): Router => {
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
          array_agg(DISTINCT c.name) as channel_names,
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

  return router;
};

export default setupTaskRoutes;
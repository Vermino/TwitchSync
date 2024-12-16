// backend/src/routes/downloads.ts

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';
import DownloadManager from '../services/downloadManager';
import { logger } from '../utils/logger';
import { VOD, UserVODPreferences } from '../types/database';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    twitch_id?: string;
  };
}

export const createDownloadsRouter = (pool: Pool, downloadManager: DownloadManager) => {
  const router = Router();

  // Get download queue status
  router.get('/queue/status', authenticate(pool), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await downloadManager.getQueueStatus();
      res.json(status);
    } catch (error) {
      logger.error('Error getting queue status:', error);
      res.status(500).json({ error: 'Failed to get queue status' });
    }
  });

  // Get download queue items
  router.get('/queue', authenticate(pool), async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const result = await client.query<VOD>(`
        SELECT id, twitch_id, title, channel_id, download_status, 
               download_priority, download_progress, error_message,
               scheduled_for, started_at
        FROM vods
        WHERE download_status IN ('queued', 'downloading')
        ORDER BY 
          CASE download_priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
          END,
          scheduled_for ASC
      `);

      res.json(result.rows);
    } catch (error) {
      logger.error('Error getting download queue:', error);
      res.status(500).json({ error: 'Failed to get download queue' });
    } finally {
      client.release();
    }
  });

  // Add VOD to download queue
  router.post('/queue/add', authenticate(pool), async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const { vodId, priority = 'normal' } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Verify VOD exists and user has access
      const vodResult = await client.query<VOD>(
        'SELECT id, channel_id FROM vods WHERE id = $1',
        [vodId]
      );

      if (vodResult.rows.length === 0) {
        return res.status(404).json({ error: 'VOD not found' });
      }

      // Get user's preferences for this channel
      const prefsResult = await client.query<UserVODPreferences>(
        'SELECT * FROM user_vod_preferences WHERE user_id = $1 AND channel_id = $2',
        [userId, vodResult.rows[0].channel_id]
      );

      // Use user's preferences or defaults
      const downloadPriority = priority || prefsResult.rows[0]?.download_priority || 'normal';

      await downloadManager.addToQueue(vodId, downloadPriority);

      res.json({ message: 'VOD added to download queue' });
    } catch (error) {
      logger.error('Error adding to download queue:', error);
      res.status(500).json({ error: 'Failed to add to download queue' });
    } finally {
      client.release();
    }
  });

  // Retry failed download
  router.post('/retry/:vodId', authenticate(pool), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const vodId = parseInt(req.params.vodId);
      await downloadManager.retryFailedDownload(vodId);
      res.json({ message: 'Download retry initiated' });
    } catch (error) {
      logger.error('Error retrying download:', error);
      res.status(500).json({ error: 'Failed to retry download' });
    }
  });

  // Cancel download
  router.post('/cancel/:vodId', authenticate(pool), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const vodId = parseInt(req.params.vodId);
      await downloadManager.cancelDownload(vodId);
      res.json({ message: 'Download cancelled' });
    } catch (error) {
      logger.error('Error cancelling download:', error);
      res.status(500).json({ error: 'Failed to cancel download' });
    }
  });

  // Get download history
  router.get('/history', authenticate(pool), async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await client.query<VOD>(`
        SELECT v.id, v.twitch_id, v.title, v.channel_id, 
               v.download_status, v.download_path, v.file_size,
               v.error_message, v.started_at, v.downloaded_at,
               v.download_progress, v.retry_count
        FROM vods v
        JOIN user_vod_preferences uvp ON v.channel_id = uvp.channel_id
        WHERE uvp.user_id = $1
        AND v.download_status NOT IN ('pending', 'queued')
        ORDER BY 
          CASE 
            WHEN v.download_status = 'downloading' THEN 1
            WHEN v.download_status = 'failed' THEN 2
            ELSE 3
          END,
          v.started_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);

      const countResult = await client.query(`
        SELECT COUNT(*) as total
        FROM vods v
        JOIN user_vod_preferences uvp ON v.channel_id = uvp.channel_id
        WHERE uvp.user_id = $1
        AND v.download_status NOT IN ('pending', 'queued')
      `, [userId]);

      res.json({
        downloads: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          limit,
          offset
        }
      });
    } catch (error) {
      logger.error('Error getting download history:', error);
      res.status(500).json({ error: 'Failed to get download history' });
    } finally {
      client.release();
    }
  });

  // Get download statistics
  router.get('/stats', authenticate(pool), async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const result = await client.query(`
        SELECT 
          COUNT(*) as total_downloads,
          COUNT(CASE WHEN download_status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN download_status = 'failed' THEN 1 END) as failed,
          SUM(file_size) as total_size,
          AVG(EXTRACT(EPOCH FROM (downloaded_at - started_at))) as avg_download_time,
          MAX(file_size) as largest_download,
          MIN(file_size) as smallest_download
        FROM vods v
        JOIN user_vod_preferences uvp ON v.channel_id = uvp.channel_id
        WHERE uvp.user_id = $1
        AND download_status NOT IN ('pending', 'queued')
      `, [userId]);

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error getting download stats:', error);
      res.status(500).json({ error: 'Failed to get download stats' });
    } finally {
      client.release();
    }
  });

  // Update download preferences
  router.put('/preferences/:channelId', authenticate(pool), async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const channelId = parseInt(req.params.channelId);
      const {
        auto_download,
        preferred_quality,
        download_chat,
        download_markers,
        download_priority,
        retention_days,
        storage_path,
        notification_settings
      } = req.body;

      const result = await client.query<UserVODPreferences>(`
        INSERT INTO user_vod_preferences (
          user_id, channel_id, auto_download, preferred_quality,
          download_chat, download_markers, download_priority,
          retention_days, storage_path, notification_settings
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id, channel_id) DO UPDATE SET
          auto_download = EXCLUDED.auto_download,
          preferred_quality = EXCLUDED.preferred_quality,
          download_chat = EXCLUDED.download_chat,
          download_markers = EXCLUDED.download_markers,
          download_priority = EXCLUDED.download_priority,
          retention_days = EXCLUDED.retention_days,
          storage_path = EXCLUDED.storage_path,
          notification_settings = EXCLUDED.notification_settings,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [
        userId,
        channelId,
        auto_download,
        preferred_quality,
        download_chat,
        download_markers,
        download_priority,
        retention_days,
        storage_path,
        notification_settings
      ]);

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error updating download preferences:', error);
      res.status(500).json({ error: 'Failed to update download preferences' });
    } finally {
      client.release();
    }
  });

  // Get download preferences for a channel
  router.get('/preferences/:channelId', authenticate(pool), async (req: AuthenticatedRequest, res: Response) => {
    const client = await pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const channelId = parseInt(req.params.channelId);

      const result = await client.query<UserVODPreferences>(
        'SELECT * FROM user_vod_preferences WHERE user_id = $1 AND channel_id = $2',
        [userId, channelId]
      );

      if (result.rows.length === 0) {
        // Return default preferences if none exist
        res.json({
          auto_download: false,
          preferred_quality: 'source',
          download_chat: true,
          download_markers: true,
          download_priority: 'normal',
          retention_days: 30,
          notification_settings: {
            download_started: true,
            download_completed: true,
            download_failed: true,
            space_warning: true
          }
        });
      } else {
        res.json(result.rows[0]);
      }
    } catch (error) {
      logger.error('Error getting download preferences:', error);
      res.status(500).json({ error: 'Failed to get download preferences' });
    } finally {
      client.release();
    }
  });

  return router;
};

export default createDownloadsRouter;

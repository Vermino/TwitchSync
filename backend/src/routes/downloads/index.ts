import { Router } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export function setupDownloadsRoutes(pool: Pool): Router {
  const router = Router();

  // Get all downloads
  router.get('/', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT 
          dq.id,
          dq.vod_id,
          dq.status,
          dq.error_message,
          v.title as filename,
          COALESCE(vd.progress, 0) as progress,
          COALESCE(vd.speed, '0 KB/s') as speed,
          COALESCE(vd.remaining, 'Unknown') as remaining
        FROM download_queue dq
        LEFT JOIN vods v ON dq.vod_id = v.id
        LEFT JOIN vod_downloads vd ON dq.vod_id = vd.vod_id
        ORDER BY dq.created_at DESC
      `);

      res.json(result.rows);
    } catch (error) {
      logger.error('Error getting downloads:', error);
      res.status(500).json({ error: 'Failed to get downloads' });
    }
  });

  // Retry download
  router.post('/:id/retry', async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query(
        "UPDATE download_queue SET status = 'pending', error_message = NULL WHERE id = $1",
        [id]
      );
      res.json({ message: 'Download queued for retry' });
    } catch (error) {
      logger.error('Error retrying download:', error);
      res.status(500).json({ error: 'Failed to retry download' });
    }
  });

  // Cancel download
  router.post('/:id/cancel', async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query(
        "UPDATE download_queue SET status = 'cancelled' WHERE id = $1",
        [id]
      );
      res.json({ message: 'Download cancelled' });
    } catch (error) {
      logger.error('Error cancelling download:', error);
      res.status(500).json({ error: 'Failed to cancel download' });
    }
  });

  return router;
}

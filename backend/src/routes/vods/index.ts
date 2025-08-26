// Filepath: backend/src/routes/vods/index.ts

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../../middleware/auth';
import { VOD } from '../../types/vod';
import { withTransaction } from '../../middleware/withTransaction';
import { logger } from '../../utils/logger';

export function setupVodRoutes(pool: Pool): Router {
  const router = Router();

  // Get all VODs for the authenticated user
  router.get('/', authenticate(pool), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const client = await pool.connect();
    try {
      const result = await withTransaction(pool, async (client) => {
        const vodsQuery = await client.query<VOD>(`
          SELECT 
            v.*,
            t.name as task_name,
            t.user_id as task_user_id,
            c.username as channel_name,
            g.name as game_name,
            t.status as task_status
          FROM vods v
          LEFT JOIN tasks t ON v.task_id = t.id
          LEFT JOIN channels c ON v.channel_id = c.id
          LEFT JOIN games g ON v.game_id = g.id
          WHERE t.user_id = $1
          ORDER BY v.created_at DESC
        `, [userId]);

        // Return VODs directly - download_progress is already in the vods table
        return vodsQuery.rows;
      });

      res.json(result);
    } catch (error) {
      logger.error('Error fetching VODs:', error);
      res.status(500).json({ error: 'Failed to fetch VODs' });
    } finally {
      client.release();
    }
  });

  // Delete a VOD
  router.delete('/:id', authenticate(pool), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      await withTransaction(pool, async (client) => {
        const vodId = parseInt(req.params.id);

        // Verify ownership
        const verifyQuery = await client.query(`
          SELECT v.id
          FROM vods v
          JOIN tasks t ON v.task_id = t.id
          WHERE v.id = $1 AND t.user_id = $2
        `, [vodId, userId]);

        if (verifyQuery.rows.length === 0) {
          throw new Error('VOD not found or access denied');
        }

        // Delete the VOD
        await client.query('DELETE FROM vods WHERE id = $1', [vodId]);
      });

      res.json({ message: 'VOD deleted successfully' });
    } catch (error) {
      logger.error('Error deleting VOD:', error);
      res.status(500).json({ error: 'Failed to delete VOD' });
    }
  });

  return router;
}

export default setupVodRoutes;

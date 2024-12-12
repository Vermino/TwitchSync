// src/routes/vods.ts
import { Router } from 'express';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

const router = Router();

export const setupVODRoutes = (pool: Pool) => {
  // Get all VODs with pagination
  router.get('/', async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    try {
      const result = await pool.query(
        `SELECT v.*, c.username as channel_name 
         FROM vods v 
         LEFT JOIN channels c ON v.channel_id = c.id 
         ORDER BY created_at DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await pool.query('SELECT COUNT(*) FROM vods');
      const totalVods = parseInt(countResult.rows[0].count);

      res.json({
        vods: result.rows,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalVods / limit),
          totalItems: totalVods
        }
      });
    } catch (error) {
      logger.error('Error fetching VODs:', error);
      res.status(500).json({ error: 'Failed to fetch VODs' });
    }
  });

  // Get VODs by channel
  router.get('/channel/:channelId', async (req, res) => {
    const { channelId } = req.params;
    try {
      const result = await pool.query(
        'SELECT * FROM vods WHERE channel_id = $1 ORDER BY created_at DESC',
        [channelId]
      );
      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching channel VODs:', error);
      res.status(500).json({ error: 'Failed to fetch channel VODs' });
    }
  });

  return router;
};

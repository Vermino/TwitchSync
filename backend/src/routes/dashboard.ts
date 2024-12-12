import { Router } from 'express';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

const router = Router();

export const setupDashboardRoutes = (pool: Pool) => {
  // Get dashboard statistics
  router.get('/stats', async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get channel stats
      const channelStats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active
        FROM channels
      `);

      // Get game stats
      const gameStats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active
        FROM tracked_games
      `);

      // Get VOD stats
      const vodStats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(view_count), 0) as total_views
        FROM vods
      `);

      // Get download stats
      const downloadStats = await client.query(`
        SELECT 
          COUNT(CASE WHEN status = 'downloading' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM download_queue
      `);

      await client.query('COMMIT');

      res.json({
        channels: {
          total: parseInt(channelStats.rows[0].total),
          active: parseInt(channelStats.rows[0].active)
        },
        games: {
          total: parseInt(gameStats.rows[0].total),
          active: parseInt(gameStats.rows[0].active)
        },
        vods: {
          total: parseInt(vodStats.rows[0].total),
          totalViews: parseInt(vodStats.rows[0].total_views)
        },
        downloads: {
          active: parseInt(downloadStats.rows[0].active),
          pending: parseInt(downloadStats.rows[0].pending),
          completed: parseInt(downloadStats.rows[0].completed),
          failed: parseInt(downloadStats.rows[0].failed)
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error fetching dashboard stats:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    } finally {
      client.release();
    }
  });

  return router;
};

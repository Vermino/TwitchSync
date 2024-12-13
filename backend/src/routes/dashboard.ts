import { Router } from 'express';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

const router = Router();

interface DashboardStats {
  channels: {
    total: number;
    active: number;
  };
  games: {
    total: number;
    active: number;
  };
  vods: {
    total: number;
    totalViews: number;
  };
  downloads: {
    active: number;
    pending: number;
    completed: number;
    failed: number;
  };
}

export function setupDashboardRoutes(pool: Pool): Router {
  router.get('/stats', async (req, res) => {
    const client = await pool.connect();

    try {
      logger.debug('Fetching dashboard stats...');

      // Get the user's twitch_id from the auth token
      const userResult = await client.query(
        'SELECT twitch_id FROM users WHERE id = $1',
        [req.user?.id]
      );

      if (!userResult.rows.length) {
        throw new Error('User not found');
      }

      const twitchId = userResult.rows[0].twitch_id;
      logger.debug('Found twitch_id:', twitchId);

      await client.query('BEGIN');

      // Get channel stats using twitch_id
      const channelStats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active
        FROM channels
        WHERE twitch_id = $1
      `, [twitchId]);

      logger.debug('Channel stats:', channelStats.rows[0]);

      // Get game stats for channels owned by this user
      const gameStats = await client.query(`
        SELECT 
          COUNT(DISTINCT g.id) as total,
          COUNT(DISTINCT CASE WHEN g.is_active = true THEN g.id END) as active
        FROM tracked_games g
        JOIN channels c ON c.current_game_id = g.twitch_game_id
        WHERE c.twitch_id = $1
      `, [twitchId]);

      // Get VOD stats
      const vodStats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(view_count), 0) as total_views
        FROM vods v
        JOIN channels c ON v.channel_id = c.id
        WHERE c.twitch_id = $1
      `, [twitchId]);

      // Get download stats
      const downloadStats = await client.query(`
        SELECT 
          COUNT(CASE WHEN dq.status = 'downloading' THEN 1 END) as active,
          COUNT(CASE WHEN dq.status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN dq.status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN dq.status = 'failed' THEN 1 END) as failed
        FROM download_queue dq
        JOIN vods v ON dq.vod_id = v.id
        JOIN channels c ON v.channel_id = c.id
        WHERE c.twitch_id = $1
      `, [twitchId]);

      await client.query('COMMIT');

      const stats: DashboardStats = {
        channels: {
          total: parseInt(channelStats.rows[0].total) || 0,
          active: parseInt(channelStats.rows[0].active) || 0
        },
        games: {
          total: parseInt(gameStats.rows[0].total) || 0,
          active: parseInt(gameStats.rows[0].active) || 0
        },
        vods: {
          total: parseInt(vodStats.rows[0].total) || 0,
          totalViews: parseInt(vodStats.rows[0].total_views) || 0
        },
        downloads: {
          active: parseInt(downloadStats.rows[0].active) || 0,
          pending: parseInt(downloadStats.rows[0].pending) || 0,
          completed: parseInt(downloadStats.rows[0].completed) || 0,
          failed: parseInt(downloadStats.rows[0].failed) || 0
        }
      };

      logger.debug('Sending stats:', stats);
      res.json(stats);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error fetching dashboard stats:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    } finally {
      client.release();
    }
  });

  return router;
}

export default setupDashboardRoutes;

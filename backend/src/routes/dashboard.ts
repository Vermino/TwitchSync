// backend/src/routes/dashboard.ts

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
  tasks: {
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

      await client.query('BEGIN');

      // Get channel stats
      const channelStats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active
        FROM channels
        WHERE EXISTS (
          SELECT 1 FROM tasks 
          WHERE tasks.user_id = $1 
          AND tasks.channel_ids @> ARRAY[channels.id]
        )
      `, [req.user?.id]);

      // Get game stats
      const gameStats = await client.query(`
        SELECT 
          COUNT(DISTINCT g.id) as total,
          COUNT(DISTINCT CASE WHEN g.is_active = true THEN g.id END) as active
        FROM games g
        WHERE EXISTS (
          SELECT 1 FROM tasks 
          WHERE tasks.user_id = $1 
          AND tasks.game_ids @> ARRAY[g.id]
        )
      `, [req.user?.id]);

      // Get task stats with explicit status checking
      const taskStats = await client.query(`
        SELECT 
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM tasks
        WHERE user_id = $1
      `, [req.user?.id]);

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
        tasks: {
          active: parseInt(taskStats.rows[0].active) || 0,
          pending: parseInt(taskStats.rows[0].pending) || 0,
          completed: parseInt(taskStats.rows[0].completed) || 0,
          failed: parseInt(taskStats.rows[0].failed) || 0
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

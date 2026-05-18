import { Router } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import * as os from 'os';
import * as fs from 'fs';
import path from 'path';

export function setupSystemRoutes(pool: Pool): Router {
  const router = Router();

  const getDiskSpace = async (directory: string) => {
    try {
      // On Windows, use the root of the drive containing the directory
      const drivePath = path.parse(directory).root;
      const stats = await fs.promises.statfs(drivePath);

      return {
        free: stats.bfree * stats.bsize,
        total: stats.blocks * stats.bsize,
        used: (stats.blocks - stats.bfree) * stats.bsize
      };
    } catch (error) {
      logger.error('Error getting disk space:', error);
      return null;
    }
  };

  // Get system status
  router.get('/status', async (req, res) => {
    try {
      // Get active channels
      const channelsResult = await pool.query(
        'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM channels'
      );

      // Get active games
      const gamesResult = await pool.query(
        'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM tracked_games'
      );

      // Get VOD stats
      const vodsResult = await pool.query(
        'SELECT COUNT(*) as total FROM vods'
      );

      // Get download stats
      const downloadsResult = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'downloading') as active,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM download_queue
      `);

      // Get disk space for download directory
      const downloadPath = process.env.DOWNLOAD_PATH || path.join(process.cwd(), 'downloads');
      const diskSpace = await getDiskSpace(downloadPath);

      res.json({
        channels: {
          total: parseInt(channelsResult.rows[0].total),
          active: parseInt(channelsResult.rows[0].active)
        },
        games: {
          total: parseInt(gamesResult.rows[0].total),
          active: parseInt(gamesResult.rows[0].active)
        },
        vods: {
          total: parseInt(vodsResult.rows[0].total),
          totalViews: 0
        },
        downloads: {
          active: parseInt(downloadsResult.rows[0].active),
          pending: parseInt(downloadsResult.rows[0].pending),
          completed: parseInt(downloadsResult.rows[0].completed),
          failed: parseInt(downloadsResult.rows[0].failed)
        },
        diskSpace
      });
    } catch (error) {
      logger.error('Error getting system status:', error);
      res.status(500).json({ error: 'Failed to get system status' });
    }
  });

  return router;
}

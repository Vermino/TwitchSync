// Filepath: backend/src/routes/system.ts

import { Router, Response, RequestHandler } from 'express';
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { RequestWithUser } from '../types/auth';
import { SystemSettings } from '../types/database';
import * as path from 'path';
import { diskUsage } from '../utils/disk';

interface SystemSettingsRow {
  id: number;
  user_id: number;
  settings: {
    downloads: {
      downloadPath: string;
      tempStorageLocation: string;
      concurrentDownloadLimit: number;
      bandwidthThrottle: number;
    };
    storage: {
      diskSpaceAlertThreshold: number;
      enableAutoCleanup: boolean;
      cleanupThresholdGB: number;
      minAgeForCleanupDays: number;
      keepMetadataOnCleanup: boolean;
    };
  };
  created_at: Date;
  updated_at: Date;
}

export const setupSystemRoutes = (pool: Pool) => {
  const router = Router();

  const handleStorage: RequestHandler = async (req, res) => {
    try {
      const storageDir = process.env.STORAGE_DIR || path.join(__dirname, '../../storage');
      const stats = await diskUsage(storageDir);
      res.json({
        totalSpace: stats.total,
        usedSpace: stats.used,
        freeSpace: stats.free
      });
    } catch (error) {
      logger.error('Error getting storage stats:', error);
      res.status(500).json({ error: 'Failed to get storage statistics' });
    }
  };

  const handleGetSettings: RequestHandler = async (req, res) => {
    const userReq = req as RequestWithUser;
    if (!userReq.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let client;
    try {
      client = await pool.connect();
      const result = await client.query<SystemSettingsRow>(
        `SELECT id, user_id, settings, created_at, updated_at 
         FROM system_settings 
         WHERE user_id = $1`,
        [userReq.user.id]
      );

      if (result.rows.length > 0) {
        res.json(result.rows[0].settings);
      } else {
        const defaultSettings = {
          downloads: {
            downloadPath: process.env.DEFAULT_DOWNLOAD_PATH || path.join(process.cwd(), 'downloads'),
            tempStorageLocation: process.env.TEMP_DIR || path.join(process.cwd(), 'tmp'),
            concurrentDownloadLimit: 3,
            bandwidthThrottle: 0
          },
          storage: {
            diskSpaceAlertThreshold: 10,
            enableAutoCleanup: false,
            cleanupThresholdGB: 50,
            minAgeForCleanupDays: 30,
            keepMetadataOnCleanup: true
          }
        };

        const insertResult = await client.query<SystemSettingsRow>(
          `INSERT INTO system_settings (user_id, settings) 
           VALUES ($1, $2) 
           RETURNING id, user_id, settings, created_at, updated_at`,
          [userReq.user.id, defaultSettings]
        );
        res.json(defaultSettings);
      }
    } catch (error) {
      logger.error('Error handling settings request:', error);
      res.status(500).json({ error: 'Failed to handle settings request' });
    } finally {
      if (client) client.release();
    }
  };

  const handleUpdateSettings: RequestHandler = async (req, res) => {
    const userReq = req as RequestWithUser;
    if (!userReq.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { settings } = req.body;
    if (!settings) {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    let client;
    try {
      client = await pool.connect();
      const result = await client.query<SystemSettingsRow>(
        `INSERT INTO system_settings (user_id, settings) 
         VALUES ($1, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           settings = $2,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id, user_id, settings, created_at, updated_at`,
        [userReq.user.id, settings]
      );
      res.json(result.rows[0].settings);
    } catch (error) {
      logger.error('Error updating system settings:', error);
      res.status(500).json({ error: 'Failed to update system settings' });
    } finally {
      if (client) client.release();
    }
  };

  router.get('/storage', handleStorage);
  router.get('/settings', handleGetSettings);
  router.put('/settings', handleUpdateSettings);

  return router;
};

export default setupSystemRoutes;

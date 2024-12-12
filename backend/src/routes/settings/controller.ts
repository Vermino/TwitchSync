import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { validateSettings } from './validation';
import { AppSettings } from '../../types/settings';
import { statfs } from 'fs/promises';
import path from 'path';

export class SettingsController {
  constructor(private pool: Pool) {}

  getSettings = async (req: Request, res: Response) => {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'SELECT key, value FROM settings'
      );

      // Convert rows to settings object
      const settings = result.rows.reduce((acc: any, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {});

      res.json(settings);
    } catch (error) {
      logger.error('Error fetching settings:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    } finally {
      client.release();
    }
  };

  updateSettings = async (req: Request, res: Response) => {
    const client = await this.pool.connect();
    const settings: AppSettings = req.body;

    try {
      // Validate settings
      const validationError = validateSettings(settings);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      await client.query('BEGIN');

      // Update each settings section
      for (const [key, value] of Object.entries(settings)) {
        await client.query(
          'UPDATE settings SET value = $1 WHERE key = $2',
          [value, key]
        );
      }

      await client.query('COMMIT');
      res.json({ message: 'Settings updated successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    } finally {
      client.release();
    }
  };

  getStorageStats = async (req: Request, res: Response) => {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'SELECT value->\'downloadPath\' as path FROM settings WHERE key = \'downloads\''
      );

      const downloadPath = result.rows[0]?.path || '.';
      const stats = await statfs(downloadPath);

      res.json({
        totalSpace: stats.blocks * stats.bsize,
        freeSpace: stats.bfree * stats.bsize,
        availableSpace: stats.bavail * stats.bsize,
        usedSpace: (stats.blocks - stats.bfree) * stats.bsize
      });
    } catch (error) {
      logger.error('Error getting storage stats:', error);
      res.status(500).json({ error: 'Failed to get storage stats' });
    } finally {
      client.release();
    }
  };

  selectFolder = async (req: Request, res: Response) => {
    try {
      // In a real implementation, this would use native file picker
      // For now, we'll just validate the provided path
      const { path: folderPath } = req.body;

      if (!folderPath || typeof folderPath !== 'string') {
        return res.status(400).json({ error: 'Invalid path' });
      }

      // Check if path exists and is accessible
      await statfs(folderPath);

      res.json({ path: folderPath });
    } catch (error) {
      logger.error('Error selecting folder:', error);
      res.status(500).json({ error: 'Failed to select folder' });
    }
  };
}

export default SettingsController;

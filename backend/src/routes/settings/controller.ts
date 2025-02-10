// Filepath: backend/src/routes/settings/controller.ts

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export class SettingsController {
  constructor(private pool: Pool) {
    this.getSystemSettings = this.getSystemSettings.bind(this);
    this.updateSystemSettings = this.updateSystemSettings.bind(this);
    this.getStorageStats = this.getStorageStats.bind(this);
    this.selectFolder = this.selectFolder.bind(this);
    this.runStorageCleanup = this.runStorageCleanup.bind(this);
  }

  async getSystemSettings(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          (SELECT value FROM system_settings WHERE category = 'downloads' AND key = 'max_concurrent')::int as concurrent_downloads,
          (SELECT value FROM system_settings WHERE category = 'downloads' AND key = 'temp_dir') as temp_storage_location,
          (SELECT value FROM system_settings WHERE category = 'storage' AND key = 'retention_days')::int as retention_days
      `);

      // Convert system settings to the expected format
      const settings = {
        downloads: {
          downloadPath: path.join(os.homedir(), 'TwitchSync', 'Downloads'),
          tempStorageLocation: result.rows[0].temp_storage_location || path.join(os.homedir(), 'TwitchSync', 'Temp'),
          concurrentDownloadLimit: result.rows[0].concurrent_downloads || 3,
          bandwidthThrottle: 0
        },
        fileOrganization: {
          filenameTemplate: '{date}_{channel}_{title}',
          folderStructure: 'by_channel',
          createDateBasedFolders: false,
          createChannelFolders: true,
          createGameFolders: true,
          metadataFormat: 'json'
        },
        storage: {
          diskSpaceAlertThreshold: 10,
          enableAutoCleanup: false,
          cleanupThresholdGB: 50,
          minAgeForCleanupDays: result.rows[0].retention_days || 30,
          keepMetadataOnCleanup: true
        },
        notifications: {
          enableEmailNotifications: false,
          emailAddress: '',
          enableDesktopNotifications: true,
          enableDiscordWebhook: false,
          discordWebhookUrl: '',
          notifyOnDownloadStart: false,
          notifyOnDownloadComplete: true,
          notifyOnError: true,
          notifyOnStorageAlert: true
        }
      };

      // Create download directories if they don't exist
      try {
        if (settings.downloads?.downloadPath) {
          await fs.mkdir(settings.downloads.downloadPath, { recursive: true });
        }
        if (settings.downloads?.tempStorageLocation) {
          await fs.mkdir(settings.downloads.tempStorageLocation, { recursive: true });
        }
      } catch (error) {
        logger.error('Error creating directories:', error);
      }

      res.json(settings);
    } catch (error) {
      logger.error('Error fetching system settings:', error);
      res.status(500).json({ error: 'Failed to fetch system settings' });
    } finally {
      client.release();
    }
  }

  async updateSystemSettings(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const settings = req.body;

      await client.query('BEGIN');

      try {
        // Update downloads settings
        if (settings.downloads) {
          await client.query(`
            UPDATE system_settings 
            SET value = $1 
            WHERE category = 'downloads' AND key = 'max_concurrent'
          `, [settings.downloads.concurrentDownloadLimit.toString()]);

          await client.query(`
            UPDATE system_settings 
            SET value = $1 
            WHERE category = 'downloads' AND key = 'temp_dir'
          `, [settings.downloads.tempStorageLocation]);
        }

        // Update storage settings
        if (settings.storage) {
          await client.query(`
            UPDATE system_settings 
            SET value = $1 
            WHERE category = 'storage' AND key = 'retention_days'
          `, [settings.storage.minAgeForCleanupDays.toString()]);
        }

        // Create download directories
        try {
          if (settings.downloads?.downloadPath) {
            await fs.mkdir(settings.downloads.downloadPath, { recursive: true });
          }
          if (settings.downloads?.tempStorageLocation) {
            await fs.mkdir(settings.downloads.tempStorageLocation, { recursive: true });
          }
        } catch (error) {
          logger.error('Error creating directories:', error);
        }

        await client.query('COMMIT');
        res.json({ message: 'Settings updated successfully' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error updating system settings:', error);
      res.status(500).json({ error: 'Failed to update system settings' });
    } finally {
      client.release();
    }
  }

  async getStorageStats(req: Request, res: Response) {
    try {
      // Get download path
      const downloadPath = path.join(os.homedir(), 'TwitchSync', 'Downloads');

      try {
        await fs.mkdir(downloadPath, { recursive: true });
      } catch (error) {
        logger.error('Error creating download directory:', error);
      }

      const stats = await this.getDiskSpace(downloadPath);
      res.json(stats);
    } catch (error) {
      logger.error('Error getting storage stats:', error);
      res.status(500).json({ error: 'Failed to get storage stats' });
    }
  }

  async selectFolder(req: Request, res: Response) {
    try {
      // Return a default path for now
      const defaultPath = path.join(os.homedir(), 'TwitchSync');

      try {
        await fs.mkdir(defaultPath, { recursive: true });
      } catch (error) {
        logger.error('Error creating default folder:', error);
      }

      res.json({ path: defaultPath });
    } catch (error) {
      logger.error('Error selecting folder:', error);
      res.status(500).json({ error: 'Failed to select folder' });
    }
  }

  async runStorageCleanup(req: Request, res: Response) {
    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(`
          SELECT value::integer as retention_days
          FROM system_settings 
          WHERE category = 'storage' AND key = 'retention_days'
        `);

        const retentionDays = result.rows[0]?.retention_days || 30;
        // TODO: Implement actual cleanup logic
        res.json({ message: 'Storage cleanup initiated' });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error running storage cleanup:', error);
      res.status(500).json({ error: 'Failed to run storage cleanup' });
    }
  }

  private async getDiskSpace(pathToCheck: string): Promise<{ totalSpace: number; usedSpace: number; freeSpace: number }> {
    try {
      await fs.access(pathToCheck);
      // For now, return dummy data as actual disk space checking requires additional system-level access
      return {
        totalSpace: 500 * 1024 * 1024 * 1024, // 500 GB
        usedSpace: 200 * 1024 * 1024 * 1024,  // 200 GB
        freeSpace: 300 * 1024 * 1024 * 1024   // 300 GB
      };
    } catch (error) {
      logger.error('Error checking disk space:', error);
      return {
        totalSpace: 0,
        usedSpace: 0,
        freeSpace: 0
      };
    }
  }
}

export const createSettingsController = (pool: Pool) => new SettingsController(pool);

export default SettingsController;

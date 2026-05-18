// Filepath: backend/src/routes/settings/controller.ts

import { Request, Response } from 'express';
import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import { CleanupService } from '../../services/cleanupService';
import { resolveDownloadPath } from '../../utils/storagePaths';
import { validateSettings } from './validation';

const execAsync = promisify(exec);

const DEFAULT_SETTINGS = {
  downloads: {
    downloadPath: '',
    tempStorageLocation: path.join(os.homedir(), 'TwitchSync', 'Temp'),
    concurrentDownloadLimit: 3,
    bandwidthThrottle: 0,
    defaultQuality: 'source'
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
    minAgeForCleanupDays: 30,
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
} as const;

const settingKey = (category: string, key: string) => `${category}:${key}`;

const normalizeStringSetting = (value: unknown, fallback: string) => {
  if (typeof value === 'string') {
    return value.replace(/^"|"$/g, '');
  }

  return value == null ? fallback : String(value);
};

const normalizeNumberSetting = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeBooleanSetting = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
};

const toJsonbValue = (value: string | number | boolean) => (
  typeof value === 'string' ? JSON.stringify(value) : value
);

export class SettingsController {
  constructor(private pool: Pool) {
    this.getSystemSettings = this.getSystemSettings.bind(this);
    this.updateSystemSettings = this.updateSystemSettings.bind(this);
    this.getStorageStats = this.getStorageStats.bind(this);
    this.selectFolder = this.selectFolder.bind(this);
    this.runStorageCleanup = this.runStorageCleanup.bind(this);
    this.browsePath = this.browsePath.bind(this);
    this.rescanFilesystem = this.rescanFilesystem.bind(this);
    this.rescanNow = this.rescanNow.bind(this);
  }

  async getSystemSettings(req: Request, res: Response) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT category, key, value
        FROM system_settings
        WHERE category = ANY($1::text[])
      `, [['downloads', 'fileOrganization', 'storage', 'notifications']]);

      const values = new Map<string, unknown>();
      result.rows.forEach((row) => {
        values.set(settingKey(row.category, row.key), row.value);
      });

      const rawDownloadPath = normalizeStringSetting(
        values.get(settingKey('downloads', 'download_path')),
        DEFAULT_SETTINGS.downloads.downloadPath
      );
      const downloadPathResolution = resolveDownloadPath(rawDownloadPath);

      const settings = {
        downloads: {
          downloadPath: downloadPathResolution.displayPath,
          tempStorageLocation: normalizeStringSetting(
            values.get(settingKey('downloads', 'temp_dir')),
            process.env.TEMP_DIR || DEFAULT_SETTINGS.downloads.tempStorageLocation
          ),
          concurrentDownloadLimit: normalizeNumberSetting(
            values.get(settingKey('downloads', 'max_concurrent')),
            DEFAULT_SETTINGS.downloads.concurrentDownloadLimit
          ),
          bandwidthThrottle: normalizeNumberSetting(
            values.get(settingKey('downloads', 'bandwidth_throttle')),
            DEFAULT_SETTINGS.downloads.bandwidthThrottle
          ),
          defaultQuality: normalizeStringSetting(
            values.get(settingKey('downloads', 'default_quality')),
            DEFAULT_SETTINGS.downloads.defaultQuality
          )
        },
        fileOrganization: {
          filenameTemplate: normalizeStringSetting(
            values.get(settingKey('fileOrganization', 'filename_template')),
            DEFAULT_SETTINGS.fileOrganization.filenameTemplate
          ),
          folderStructure: normalizeStringSetting(
            values.get(settingKey('fileOrganization', 'folder_structure')),
            DEFAULT_SETTINGS.fileOrganization.folderStructure
          ),
          createDateBasedFolders: normalizeBooleanSetting(
            values.get(settingKey('fileOrganization', 'create_date_based_folders')),
            DEFAULT_SETTINGS.fileOrganization.createDateBasedFolders
          ),
          createChannelFolders: normalizeBooleanSetting(
            values.get(settingKey('fileOrganization', 'create_channel_folders')),
            DEFAULT_SETTINGS.fileOrganization.createChannelFolders
          ),
          createGameFolders: normalizeBooleanSetting(
            values.get(settingKey('fileOrganization', 'create_game_folders')),
            DEFAULT_SETTINGS.fileOrganization.createGameFolders
          ),
          metadataFormat: normalizeStringSetting(
            values.get(settingKey('fileOrganization', 'metadata_format')),
            DEFAULT_SETTINGS.fileOrganization.metadataFormat
          )
        },
        storage: {
          diskSpaceAlertThreshold: normalizeNumberSetting(
            values.get(settingKey('storage', 'disk_space_alert_threshold')),
            DEFAULT_SETTINGS.storage.diskSpaceAlertThreshold
          ),
          enableAutoCleanup: normalizeBooleanSetting(
            values.get(settingKey('storage', 'enable_auto_cleanup')),
            DEFAULT_SETTINGS.storage.enableAutoCleanup
          ),
          cleanupThresholdGB: normalizeNumberSetting(
            values.get(settingKey('storage', 'cleanup_threshold_gb')),
            DEFAULT_SETTINGS.storage.cleanupThresholdGB
          ),
          minAgeForCleanupDays: normalizeNumberSetting(
            values.get(settingKey('storage', 'retention_days')),
            DEFAULT_SETTINGS.storage.minAgeForCleanupDays
          ),
          keepMetadataOnCleanup: normalizeBooleanSetting(
            values.get(settingKey('storage', 'keep_metadata_on_cleanup')),
            DEFAULT_SETTINGS.storage.keepMetadataOnCleanup
          )
        },
        notifications: {
          enableEmailNotifications: normalizeBooleanSetting(
            values.get(settingKey('notifications', 'enable_email_notifications')),
            DEFAULT_SETTINGS.notifications.enableEmailNotifications
          ),
          emailAddress: normalizeStringSetting(
            values.get(settingKey('notifications', 'email_address')),
            DEFAULT_SETTINGS.notifications.emailAddress
          ),
          enableDesktopNotifications: normalizeBooleanSetting(
            values.get(settingKey('notifications', 'enable_desktop_notifications')),
            DEFAULT_SETTINGS.notifications.enableDesktopNotifications
          ),
          enableDiscordWebhook: normalizeBooleanSetting(
            values.get(settingKey('notifications', 'enable_discord_webhook')),
            DEFAULT_SETTINGS.notifications.enableDiscordWebhook
          ),
          discordWebhookUrl: normalizeStringSetting(
            values.get(settingKey('notifications', 'discord_webhook_url')),
            DEFAULT_SETTINGS.notifications.discordWebhookUrl
          ),
          notifyOnDownloadStart: normalizeBooleanSetting(
            values.get(settingKey('notifications', 'notify_on_download_start')),
            DEFAULT_SETTINGS.notifications.notifyOnDownloadStart
          ),
          notifyOnDownloadComplete: normalizeBooleanSetting(
            values.get(settingKey('notifications', 'notify_on_download_complete')),
            DEFAULT_SETTINGS.notifications.notifyOnDownloadComplete
          ),
          notifyOnError: normalizeBooleanSetting(
            values.get(settingKey('notifications', 'notify_on_error')),
            DEFAULT_SETTINGS.notifications.notifyOnError
          ),
          notifyOnStorageAlert: normalizeBooleanSetting(
            values.get(settingKey('notifications', 'notify_on_storage_alert')),
            DEFAULT_SETTINGS.notifications.notifyOnStorageAlert
          )
        }
      };

      try {
        await fs.mkdir(downloadPathResolution.runtimePath, { recursive: true });
        if (settings.downloads.tempStorageLocation) {
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
      const validationError = validateSettings(settings);

      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      await client.query('BEGIN');

      try {
        if (settings.downloads) {
          await this.upsertSetting(client, 'downloads', 'max_concurrent', settings.downloads.concurrentDownloadLimit);
          await this.upsertSetting(client, 'downloads', 'temp_dir', settings.downloads.tempStorageLocation);
          await this.upsertSetting(client, 'downloads', 'download_path', settings.downloads.downloadPath);
          await this.upsertSetting(client, 'downloads', 'bandwidth_throttle', settings.downloads.bandwidthThrottle);
          await this.upsertSetting(client, 'downloads', 'default_quality', settings.downloads.defaultQuality);
        }

        if (settings.fileOrganization) {
          await this.upsertSetting(client, 'fileOrganization', 'filename_template', settings.fileOrganization.filenameTemplate);
          await this.upsertSetting(client, 'fileOrganization', 'folder_structure', settings.fileOrganization.folderStructure);
          await this.upsertSetting(client, 'fileOrganization', 'create_date_based_folders', settings.fileOrganization.createDateBasedFolders);
          await this.upsertSetting(client, 'fileOrganization', 'create_channel_folders', settings.fileOrganization.createChannelFolders);
          await this.upsertSetting(client, 'fileOrganization', 'create_game_folders', settings.fileOrganization.createGameFolders);
          await this.upsertSetting(client, 'fileOrganization', 'metadata_format', settings.fileOrganization.metadataFormat);
        }

        if (settings.storage) {
          await this.upsertSetting(client, 'storage', 'disk_space_alert_threshold', settings.storage.diskSpaceAlertThreshold);
          await this.upsertSetting(client, 'storage', 'enable_auto_cleanup', settings.storage.enableAutoCleanup);
          await this.upsertSetting(client, 'storage', 'cleanup_threshold_gb', settings.storage.cleanupThresholdGB);
          await this.upsertSetting(client, 'storage', 'retention_days', settings.storage.minAgeForCleanupDays);
          await this.upsertSetting(client, 'storage', 'keep_metadata_on_cleanup', settings.storage.keepMetadataOnCleanup);
        }

        if (settings.notifications) {
          await this.upsertSetting(client, 'notifications', 'enable_email_notifications', settings.notifications.enableEmailNotifications);
          await this.upsertSetting(client, 'notifications', 'email_address', settings.notifications.emailAddress);
          await this.upsertSetting(client, 'notifications', 'enable_desktop_notifications', settings.notifications.enableDesktopNotifications);
          await this.upsertSetting(client, 'notifications', 'enable_discord_webhook', settings.notifications.enableDiscordWebhook);
          await this.upsertSetting(client, 'notifications', 'discord_webhook_url', settings.notifications.discordWebhookUrl);
          await this.upsertSetting(client, 'notifications', 'notify_on_download_start', settings.notifications.notifyOnDownloadStart);
          await this.upsertSetting(client, 'notifications', 'notify_on_download_complete', settings.notifications.notifyOnDownloadComplete);
          await this.upsertSetting(client, 'notifications', 'notify_on_error', settings.notifications.notifyOnError);
          await this.upsertSetting(client, 'notifications', 'notify_on_storage_alert', settings.notifications.notifyOnStorageAlert);
        }

        try {
          const downloadPathResolution = resolveDownloadPath(settings.downloads?.downloadPath);
          await fs.mkdir(downloadPathResolution.runtimePath, { recursive: true });
          if (settings.downloads?.tempStorageLocation) {
            await fs.mkdir(settings.downloads.tempStorageLocation, { recursive: true });
          }
        } catch (error) {
          logger.error('Error creating directories:', error);
        }

        await client.query('COMMIT');

        setImmediate(() => this.rescanFilesystem().catch((err: Error) =>
          logger.error('Background filesystem rescan error:', err.message)
        ));

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
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT value FROM system_settings
        WHERE category = 'downloads' AND key = 'download_path'
      `);
      const rawVal = result.rows[0]?.value;
      const downloadPath = resolveDownloadPath(rawVal).runtimePath;

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
    } finally {
      client.release();
    }
  }

  async selectFolder(req: Request, res: Response) {
    try {
      const defaultPath = process.env.VOD_STORAGE_HOST_PATH || process.env.STORAGE_PATH || path.join(os.homedir(), 'TwitchSync');
      res.json({ path: defaultPath });
    } catch (error) {
      logger.error('Error selecting folder:', error);
      res.status(500).json({ error: 'Failed to select folder' });
    }
  }

  async browsePath(req: Request, res: Response) {
    try {
      const requestedPath = req.query.path as string;
      const isWindows = process.platform === 'win32';

      let browsePath: string;

      if (!requestedPath || requestedPath === '/' || requestedPath === '') {
        browsePath = isWindows ? '' : '/';
      } else {
        browsePath = path.resolve(requestedPath);
      }

      if (isWindows && !browsePath) {
        const { stdout } = await execAsync('wmic logicaldisk get Name /format:csv');
        const drives = stdout
          .trim()
          .split('\n')
          .filter((line) => line.trim() && !line.startsWith('Node'))
          .map((line) => line.trim().split(',').pop()?.trim())
          .filter(Boolean)
          .map((drive) => ({ name: `${drive}\\`, path: `${drive}\\`, type: 'drive' }));
        return res.json({ path: '', parent: null, entries: drives, separator: '\\' });
      }

      const entries: { name: string; path: string; type: string }[] = [];
      const items = await fs.readdir(browsePath, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory()) {
          entries.push({
            name: item.name,
            path: path.join(browsePath, item.name),
            type: 'directory'
          });
        }
      }

      entries.sort((left, right) => left.name.toLowerCase().localeCompare(right.name.toLowerCase()));

      const parentRaw = path.dirname(browsePath);
      let parent: string | null;
      if (isWindows && parentRaw === browsePath) {
        parent = '';
      } else if (!isWindows && browsePath === '/') {
        parent = null;
      } else {
        parent = parentRaw;
      }

      res.json({
        path: browsePath,
        parent,
        entries,
        separator: isWindows ? '\\' : '/'
      });
    } catch (error: any) {
      logger.error('Error browsing path:', error);
      if (error.code === 'EACCES') {
        res.status(403).json({ error: 'Permission denied' });
      } else if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Path not found' });
      } else {
        res.status(500).json({ error: 'Failed to browse path' });
      }
    }
  }

  async runStorageCleanup(req: Request, res: Response) {
    try {
      const cleanupService = new CleanupService(this.pool);
      const stats = await cleanupService.forceCleanup();
      res.json({
        message: 'Storage cleanup completed',
        stats: {
          tempFilesDeleted: stats.tempFiles.deleted,
          logFilesDeleted: stats.logFiles.deleted,
          spaceFreedMB: Math.round((stats.tempFiles.spaceFreed + stats.logFiles.spaceFreed) / 1024 / 1024),
          databaseEventsDeleted: stats.database.oldEvents,
          orphanedRecordsDeleted: stats.database.orphanedRecords,
          durationMs: stats.duration
        }
      });
    } catch (error) {
      logger.error('Error running storage cleanup:', error);
      res.status(500).json({ error: 'Failed to run storage cleanup' });
    }
  }

  private async upsertSetting(
    client: PoolClient,
    category: string,
    key: string,
    value: string | number | boolean
  ) {
    await client.query(`
      INSERT INTO system_settings (category, key, value)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value
    `, [category, key, toJsonbValue(value)]);
  }

  private async getDiskSpace(pathToCheck: string): Promise<{ totalSpace: number; usedSpace: number; freeSpace: number }> {
    try {
      await fs.mkdir(pathToCheck, { recursive: true });

      if ((fs as any).statfs) {
        try {
          const stats = await (fs as any).statfs(pathToCheck);
          const totalSpace = stats.blocks * stats.bsize;
          const freeSpace = stats.bavail * stats.bsize;
          const usedSpace = totalSpace - freeSpace;
          return { totalSpace, usedSpace, freeSpace };
        } catch (statfsErr) {
          logger.debug('statfs failed, falling back to platform check:', statfsErr);
        }
      }

      if (process.platform === 'win32') {
        try {
          const driveLetter = path.resolve(pathToCheck).split(':')[0] + ':';
          const { stdout } = await execAsync(
            `wmic logicaldisk where "DeviceID='${driveLetter}'" get Size,FreeSpace /Format:csv`
          );
          const lines = stdout.trim().split('\n').filter((line) => line.trim() && !line.startsWith('Node'));
          if (lines.length > 0) {
            const parts = lines[0].trim().split(',');
            if (parts.length >= 3) {
              const freeSpace = parseInt(parts[1], 10);
              const totalSpace = parseInt(parts[2], 10);
              const usedSpace = totalSpace - freeSpace;
              if (!isNaN(totalSpace) && !isNaN(freeSpace)) {
                return { totalSpace, usedSpace, freeSpace };
              }
            }
          }
        } catch (wmicErr) {
          logger.debug('wmic disk space check failed:', wmicErr);
        }
      }

      logger.warn('Could not determine real disk space; returning zeros.');
      return { totalSpace: 0, usedSpace: 0, freeSpace: 0 };
    } catch (error) {
      logger.error('Error checking disk space:', error);
      return { totalSpace: 0, usedSpace: 0, freeSpace: 0 };
    }
  }

  private async rescanFilesystem(): Promise<{ checked: number; missing: number }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT vfs.vod_id, vfs.file_path
        FROM vod_file_states vfs
        WHERE vfs.file_state = 'present' AND vfs.file_path IS NOT NULL
        UNION
        SELECT cv.vod_id, cv.file_path
        FROM completed_vods cv
        WHERE cv.file_path IS NOT NULL
      `);

      let missingIds: number[] = [];

      if (result.rows.length === 0) {
        logger.info('Filesystem rescan: nothing to check - DB already clean');
      } else {
        logger.info(`Filesystem rescan: checking ${result.rows.length} file path(s)`);

        missingIds = Array.from(new Set(
          (await Promise.all(result.rows.map(async (row) => {
            try {
              await fs.access(row.file_path);
              return null;
            } catch {
              logger.info(`Filesystem rescan: missing file for VOD ${row.vod_id}: ${row.file_path}`);
              return Number(row.vod_id);
            }
          }))).filter((vodId): vodId is number => vodId !== null)
        ));

        if (missingIds.length > 0) {
          await client.query(`
            UPDATE vod_file_states
            SET file_state = 'missing', updated_at = NOW()
            WHERE vod_id = ANY($1::int[])
          `, [missingIds]);

          await client.query(`
            DELETE FROM completed_vods WHERE vod_id = ANY($1::int[])
          `, [missingIds]);

          await client.query(`
            UPDATE vods
            SET status = 'pending',
                download_status = 'pending',
                download_progress = 0,
                download_path = NULL,
                file_size = NULL,
                checksum = NULL,
                downloaded_at = NULL,
                error_message = NULL,
                updated_at = NOW()
            WHERE id = ANY($1::int[])
              AND (download_status = 'completed' OR status = 'completed')
          `, [missingIds]);

          logger.info(`Filesystem rescan done: ${missingIds.length}/${result.rows.length} missing - DB cleared`);
        } else {
          logger.info(`Filesystem rescan done: all ${result.rows.length} file(s) confirmed on disk`);
        }
      }

      await client.query(`
        UPDATE vods v
        SET status = 'pending',
            download_progress = 0,
            checksum = NULL,
            error_message = NULL,
            updated_at = NOW()
        WHERE v.status = 'completed'
          AND v.download_status = 'pending'
          AND v.download_path IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM completed_vods cv
            WHERE cv.vod_id = v.id
          )
      `);

      return { checked: result.rows.length, missing: missingIds.length };
    } catch (err) {
      logger.error('rescanFilesystem failed:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  async rescanNow(req: Request, res: Response) {
    try {
      const result = await this.rescanFilesystem();
      res.json({ success: true, checked: result.checked, missing: result.missing });
    } catch (err: any) {
      logger.error('rescanNow failed:', err);
      res.status(500).json({ error: 'Filesystem rescan failed' });
    }
  }
}

export const createSettingsController = (pool: Pool) => new SettingsController(pool);

export default SettingsController;

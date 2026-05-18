import os from 'os';
import path from 'path';
import type { AppSettings } from '../../src/types/settings';

type QueryResult = {
  rows: any[];
  rowCount: number;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const emptyResult = (): QueryResult => ({ rows: [], rowCount: 0 });

const parseJsonbValue = (value: any) => {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const buildDefaultSettings = (): AppSettings => {
  const baseDir = path.join(os.tmpdir(), 'twitchsync-settings-smoke');

  return {
    downloads: {
      downloadPath: path.join(baseDir, 'downloads'),
      tempStorageLocation: path.join(baseDir, 'temp'),
      concurrentDownloadLimit: 3,
      bandwidthThrottle: 0,
      defaultQuality: 'source',
    },
    fileOrganization: {
      filenameTemplate: '{date}_{channel}_{title}',
      folderStructure: 'by_channel',
      createDateBasedFolders: false,
      createChannelFolders: true,
      createGameFolders: true,
      metadataFormat: 'json',
    },
    storage: {
      diskSpaceAlertThreshold: 10,
      enableAutoCleanup: false,
      cleanupThresholdGB: 50,
      minAgeForCleanupDays: 30,
      keepMetadataOnCleanup: true,
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
      notifyOnStorageAlert: true,
    },
  };
};

export class SettingsStore {
  private settings: AppSettings;
  private trackedFiles = new Map<number, { vodId: number; filePath: string; fileState: string }>();
  private completedVodPaths = new Map<number, { vodId: number; filePath: string }>();
  private vodStatuses = new Map<number, {
    vodId: number;
    status: string;
    downloadStatus: string;
    downloadProgress: number;
    downloadPath: string | null;
    fileSize: number | null;
    checksum: string | null;
    errorMessage: string | null;
  }>();

  constructor() {
    this.settings = buildDefaultSettings();
  }

  reset() {
    this.settings = buildDefaultSettings();
    this.trackedFiles.clear();
    this.completedVodPaths.clear();
    this.vodStatuses.clear();
  }

  getState() {
    return clone(this.settings);
  }

  getDownloadPath() {
    return this.settings.downloads.downloadPath;
  }

  seedTrackedVod(vodId: number, filePath: string, downloadStatus: string = 'completed') {
    this.trackedFiles.set(vodId, {
      vodId,
      filePath,
      fileState: 'present',
    });
    this.completedVodPaths.set(vodId, {
      vodId,
      filePath,
    });
    this.vodStatuses.set(vodId, {
      vodId,
      status: 'completed',
      downloadStatus,
      downloadProgress: 100,
      downloadPath: filePath,
      fileSize: 1024,
      checksum: 'seeded-checksum',
      errorMessage: 'old error',
    });
  }

  seedOrphanedCompletedVod(vodId: number) {
    this.vodStatuses.set(vodId, {
      vodId,
      status: 'completed',
      downloadStatus: 'pending',
      downloadProgress: 100,
      downloadPath: null,
      fileSize: null,
      checksum: 'stale-checksum',
      errorMessage: 'stale error',
    });
  }

  getTrackedVod(vodId: number) {
    return {
      tracked: this.trackedFiles.get(vodId) ?? null,
      completed: this.completedVodPaths.get(vodId) ?? null,
      vod: this.vodStatuses.get(vodId) ?? null,
    };
  }

  listSettings(categories: string[]) {
    const rows: Array<{ category: string; key: string; value: string | number | boolean }> = [];

    if (categories.includes('downloads')) {
      rows.push(
        { category: 'downloads', key: 'max_concurrent', value: this.settings.downloads.concurrentDownloadLimit },
        { category: 'downloads', key: 'temp_dir', value: this.settings.downloads.tempStorageLocation },
        { category: 'downloads', key: 'download_path', value: this.settings.downloads.downloadPath },
        { category: 'downloads', key: 'bandwidth_throttle', value: this.settings.downloads.bandwidthThrottle },
        { category: 'downloads', key: 'default_quality', value: this.settings.downloads.defaultQuality }
      );
    }

    if (categories.includes('fileOrganization')) {
      rows.push(
        { category: 'fileOrganization', key: 'filename_template', value: this.settings.fileOrganization.filenameTemplate },
        { category: 'fileOrganization', key: 'folder_structure', value: this.settings.fileOrganization.folderStructure },
        { category: 'fileOrganization', key: 'create_date_based_folders', value: this.settings.fileOrganization.createDateBasedFolders },
        { category: 'fileOrganization', key: 'create_channel_folders', value: this.settings.fileOrganization.createChannelFolders },
        { category: 'fileOrganization', key: 'create_game_folders', value: this.settings.fileOrganization.createGameFolders },
        { category: 'fileOrganization', key: 'metadata_format', value: this.settings.fileOrganization.metadataFormat }
      );
    }

    if (categories.includes('storage')) {
      rows.push(
        { category: 'storage', key: 'disk_space_alert_threshold', value: this.settings.storage.diskSpaceAlertThreshold },
        { category: 'storage', key: 'enable_auto_cleanup', value: this.settings.storage.enableAutoCleanup },
        { category: 'storage', key: 'cleanup_threshold_gb', value: this.settings.storage.cleanupThresholdGB },
        { category: 'storage', key: 'retention_days', value: this.settings.storage.minAgeForCleanupDays },
        { category: 'storage', key: 'keep_metadata_on_cleanup', value: this.settings.storage.keepMetadataOnCleanup }
      );
    }

    if (categories.includes('notifications')) {
      rows.push(
        { category: 'notifications', key: 'enable_email_notifications', value: this.settings.notifications.enableEmailNotifications },
        { category: 'notifications', key: 'email_address', value: this.settings.notifications.emailAddress },
        { category: 'notifications', key: 'enable_desktop_notifications', value: this.settings.notifications.enableDesktopNotifications },
        { category: 'notifications', key: 'enable_discord_webhook', value: this.settings.notifications.enableDiscordWebhook },
        { category: 'notifications', key: 'discord_webhook_url', value: this.settings.notifications.discordWebhookUrl },
        { category: 'notifications', key: 'notify_on_download_start', value: this.settings.notifications.notifyOnDownloadStart },
        { category: 'notifications', key: 'notify_on_download_complete', value: this.settings.notifications.notifyOnDownloadComplete },
        { category: 'notifications', key: 'notify_on_error', value: this.settings.notifications.notifyOnError },
        { category: 'notifications', key: 'notify_on_storage_alert', value: this.settings.notifications.notifyOnStorageAlert }
      );
    }

    return rows.map((row) => clone(row));
  }

  applySetting(category: string, key: string, rawValue: any) {
    const value = parseJsonbValue(rawValue);

    switch (`${category}:${key}`) {
      case 'downloads:max_concurrent':
        this.settings.downloads.concurrentDownloadLimit = Number(value);
        return;
      case 'downloads:temp_dir':
        this.settings.downloads.tempStorageLocation = String(value);
        return;
      case 'downloads:download_path':
        this.settings.downloads.downloadPath = String(value);
        return;
      case 'downloads:bandwidth_throttle':
        this.settings.downloads.bandwidthThrottle = Number(value);
        return;
      case 'downloads:default_quality':
        this.settings.downloads.defaultQuality = String(value);
        return;
      case 'fileOrganization:filename_template':
        this.settings.fileOrganization.filenameTemplate = String(value);
        return;
      case 'fileOrganization:folder_structure':
        this.settings.fileOrganization.folderStructure = value as AppSettings['fileOrganization']['folderStructure'];
        return;
      case 'fileOrganization:create_date_based_folders':
        this.settings.fileOrganization.createDateBasedFolders = Boolean(value);
        return;
      case 'fileOrganization:create_channel_folders':
        this.settings.fileOrganization.createChannelFolders = Boolean(value);
        return;
      case 'fileOrganization:create_game_folders':
        this.settings.fileOrganization.createGameFolders = Boolean(value);
        return;
      case 'fileOrganization:metadata_format':
        this.settings.fileOrganization.metadataFormat = value as AppSettings['fileOrganization']['metadataFormat'];
        return;
      case 'storage:disk_space_alert_threshold':
        this.settings.storage.diskSpaceAlertThreshold = Number(value);
        return;
      case 'storage:enable_auto_cleanup':
        this.settings.storage.enableAutoCleanup = Boolean(value);
        return;
      case 'storage:cleanup_threshold_gb':
        this.settings.storage.cleanupThresholdGB = Number(value);
        return;
      case 'storage:retention_days':
        this.settings.storage.minAgeForCleanupDays = Number(value);
        return;
      case 'storage:keep_metadata_on_cleanup':
        this.settings.storage.keepMetadataOnCleanup = Boolean(value);
        return;
      case 'notifications:enable_email_notifications':
        this.settings.notifications.enableEmailNotifications = Boolean(value);
        return;
      case 'notifications:email_address':
        this.settings.notifications.emailAddress = String(value);
        return;
      case 'notifications:enable_desktop_notifications':
        this.settings.notifications.enableDesktopNotifications = Boolean(value);
        return;
      case 'notifications:enable_discord_webhook':
        this.settings.notifications.enableDiscordWebhook = Boolean(value);
        return;
      case 'notifications:discord_webhook_url':
        this.settings.notifications.discordWebhookUrl = String(value);
        return;
      case 'notifications:notify_on_download_start':
        this.settings.notifications.notifyOnDownloadStart = Boolean(value);
        return;
      case 'notifications:notify_on_download_complete':
        this.settings.notifications.notifyOnDownloadComplete = Boolean(value);
        return;
      case 'notifications:notify_on_error':
        this.settings.notifications.notifyOnError = Boolean(value);
        return;
      case 'notifications:notify_on_storage_alert':
        this.settings.notifications.notifyOnStorageAlert = Boolean(value);
        return;
      default:
        throw new Error(`Unhandled setting upsert: ${category}:${key}`);
    }
  }

  handleQuery(queryText: string, params: any[] = []): QueryResult {
    const sql = queryText.replace(/\s+/g, ' ').trim().toLowerCase();

    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') {
      return emptyResult();
    }

    if (
      sql.includes('select category, key, value')
      && sql.includes('from system_settings')
      && sql.includes('where category = any($1::text[])')
    ) {
      const categories = (params[0] ?? []) as string[];
      const rows = this.listSettings(categories);
      return { rows, rowCount: rows.length };
    }

    if (
      sql.includes('insert into system_settings (category, key, value)')
      && sql.includes('values ($1, $2, $3::jsonb)')
      && sql.includes('on conflict (category, key) do update set value = excluded.value')
    ) {
      this.applySetting(String(params[0]), String(params[1]), params[2]);
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.includes('select value from system_settings')
      && sql.includes("where category = 'downloads' and key = 'download_path'")
    ) {
      return { rows: [{ value: this.getDownloadPath() }], rowCount: 1 };
    }

    if (
      sql.includes('select vfs.vod_id, vfs.file_path')
      && sql.includes('from vod_file_states vfs')
      && sql.includes('union')
      && sql.includes('from completed_vods cv')
    ) {
      const rows = new Map<string, { vod_id: number; file_path: string }>();

      for (const tracked of this.trackedFiles.values()) {
        rows.set(`${tracked.vodId}:${tracked.filePath}`, {
          vod_id: tracked.vodId,
          file_path: tracked.filePath,
        });
      }

      for (const completed of this.completedVodPaths.values()) {
        rows.set(`${completed.vodId}:${completed.filePath}`, {
          vod_id: completed.vodId,
          file_path: completed.filePath,
        });
      }

      const values = Array.from(rows.values());
      return { rows: values, rowCount: values.length };
    }

    if (
      sql.includes("update vod_file_states set file_state = 'missing'")
      && sql.includes('where vod_id = any($1::int[])')
    ) {
      const vodIds = (params[0] ?? []) as number[];
      vodIds.forEach((vodId) => {
        const tracked = this.trackedFiles.get(vodId);
        if (tracked) {
          tracked.fileState = 'missing';
        }
      });
      return { rows: [], rowCount: vodIds.length };
    }

    if (sql.includes('delete from completed_vods where vod_id = any($1::int[])')) {
      const vodIds = (params[0] ?? []) as number[];
      vodIds.forEach((vodId) => {
        this.completedVodPaths.delete(vodId);
      });
      return { rows: [], rowCount: vodIds.length };
    }

    if (
      sql.includes("update vods set status = 'pending'")
      && sql.includes("download_status = 'pending'")
      && sql.includes("download_progress = 0")
      && sql.includes('download_path = null')
      && sql.includes('file_size = null')
      && sql.includes('checksum = null')
      && sql.includes('downloaded_at = null')
      && sql.includes('error_message = null')
      && sql.includes('where id = any($1::int[])')
      && sql.includes("(download_status = 'completed' or status = 'completed')")
    ) {
      const vodIds = (params[0] ?? []) as number[];
      vodIds.forEach((vodId) => {
        const vod = this.vodStatuses.get(vodId);
        if (vod && (vod.downloadStatus === 'completed' || vod.status === 'completed')) {
          vod.status = 'pending';
          vod.downloadStatus = 'pending';
          vod.downloadProgress = 0;
          vod.downloadPath = null;
          vod.fileSize = null;
          vod.checksum = null;
          vod.errorMessage = null;
        }
      });
      return { rows: [], rowCount: vodIds.length };
    }

    if (
      sql.includes('update vods v set status = \'pending\'')
      && sql.includes("and v.download_status = 'pending'")
      && sql.includes('and v.download_path is null')
      && sql.includes('not exists ( select 1 from completed_vods cv where cv.vod_id = v.id )')
    ) {
      this.vodStatuses.forEach((vod) => {
        if (
          vod.status === 'completed'
          && vod.downloadStatus === 'pending'
          && vod.downloadPath === null
          && !this.completedVodPaths.has(vod.vodId)
        ) {
          vod.status = 'pending';
          vod.downloadProgress = 0;
          vod.checksum = null;
          vod.errorMessage = null;
        }
      });
      return { rows: [], rowCount: 0 };
    }

    throw new Error(`Unhandled query in settings harness: ${sql}`);
  }
}

class SettingsClient {
  constructor(private readonly store: SettingsStore) {}

  async query(queryText: string, params: any[] = []) {
    return this.store.handleQuery(queryText, params);
  }

  release() {}
}

class SettingsPool {
  constructor(private readonly store: SettingsStore) {}

  async connect() {
    return new SettingsClient(this.store);
  }

  async query(queryText: string, params: any[] = []) {
    return this.store.handleQuery(queryText, params);
  }
}

export const createSettingsHarness = () => {
  const store = new SettingsStore();
  const pool = new SettingsPool(store);

  return {
    store,
    pool,
  };
};

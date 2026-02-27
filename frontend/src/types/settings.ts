export interface DownloadSettings {
  downloadPath: string;
  tempStorageLocation: string;
  concurrentDownloadLimit: number;
  bandwidthThrottle: number;
  defaultQuality: string;
}

export interface FileOrganizationSettings {
  filenameTemplate: string;
  folderStructure: 'flat' | 'by_channel' | 'by_game' | 'by_date';
  createDateBasedFolders: boolean;
  createChannelFolders: boolean;
  createGameFolders: boolean;
  metadataFormat: 'json' | 'yaml' | 'nfo';
}

export interface StorageSettings {
  diskSpaceAlertThreshold: number;
  enableAutoCleanup: boolean;
  cleanupThresholdGB: number;
  minAgeForCleanupDays: number;
  keepMetadataOnCleanup: boolean;
}

export interface NotificationSettings {
  enableEmailNotifications: boolean;
  emailAddress: string;
  enableDesktopNotifications: boolean;
  enableDiscordWebhook: boolean;
  discordWebhookUrl: string;
  notifyOnDownloadStart: boolean;
  notifyOnDownloadComplete: boolean;
  notifyOnError: boolean;
  notifyOnStorageAlert: boolean;
}

export interface AppSettings {
  downloads: DownloadSettings;
  fileOrganization: FileOrganizationSettings;
  storage: StorageSettings;
  notifications: NotificationSettings;
}

export interface SystemSettings {
  downloads: {
    downloadPath: string;
    tempStorageLocation: string;
    concurrentDownloadLimit: number;
    bandwidthThrottle: number;
  };
  fileOrganization: {
    filenameTemplate: string;
    folderStructure: 'flat' | 'by_channel' | 'by_game' | 'by_date';
    createDateBasedFolders: boolean;
    createChannelFolders: boolean;
    createGameFolders: boolean;
    metadataFormat: 'json' | 'yaml' | 'nfo';
  };
  storage: {
    diskSpaceAlertThreshold: number;
    enableAutoCleanup: boolean;
    cleanupThresholdGB: number;
    minAgeForCleanupDays: number;
    keepMetadataOnCleanup: boolean;
  };
  notifications: {
    enableEmailNotifications: boolean;
    emailAddress: string;
    enableDesktopNotifications: boolean;
    enableDiscordWebhook: boolean;
    discordWebhookUrl: string;
    notifyOnDownloadStart: boolean;
    notifyOnDownloadComplete: boolean;
    notifyOnError: boolean;
    notifyOnStorageAlert: boolean;
  };
}

export interface StorageStats {
  totalSpace: number;
  usedSpace: number;
  freeSpace: number;
}

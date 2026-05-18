import type { AppSettings, DownloadSettings, FileOrganizationSettings, StorageSettings, NotificationSettings } from '../../types/settings';

export function validateDownloadSettings(settings: DownloadSettings): string | null {
  const { downloadPath, tempStorageLocation, concurrentDownloadLimit, bandwidthThrottle } = settings;

  if (typeof downloadPath !== 'string') {
    return 'Download path must be a string';
  }

  if (typeof tempStorageLocation !== 'string') {
    return 'Temporary storage location must be a string';
  }

  if (!Number.isInteger(concurrentDownloadLimit) || concurrentDownloadLimit < 1) {
    return 'Concurrent download limit must be a positive integer';
  }

  if (!Number.isInteger(bandwidthThrottle) || bandwidthThrottle < 0) {
    return 'Bandwidth throttle must be a non-negative integer';
  }

  return null;
}

export function validateFileOrganizationSettings(settings: FileOrganizationSettings): string | null {
  const {
    filenameTemplate,
    folderStructure,
    createDateBasedFolders,
    createChannelFolders,
    createGameFolders,
    metadataFormat
  } = settings;

  if (typeof filenameTemplate !== 'string' || filenameTemplate.trim().length === 0) {
    return 'Filename template must be a non-empty string';
  }

  const validStructures = ['flat', 'by_channel', 'by_game', 'by_date'];
  if (!validStructures.includes(folderStructure)) {
    return 'Invalid folder structure option';
  }

  if (typeof createDateBasedFolders !== 'boolean') {
    return 'Create date-based folders must be a boolean';
  }

  if (typeof createChannelFolders !== 'boolean') {
    return 'Create channel folders must be a boolean';
  }

  if (typeof createGameFolders !== 'boolean') {
    return 'Create game folders must be a boolean';
  }

  const validFormats = ['json', 'yaml', 'nfo'];
  if (!validFormats.includes(metadataFormat)) {
    return 'Invalid metadata format';
  }

  return null;
}

export function validateStorageSettings(settings: StorageSettings): string | null {
  const {
    diskSpaceAlertThreshold,
    enableAutoCleanup,
    cleanupThresholdGB,
    minAgeForCleanupDays,
    keepMetadataOnCleanup
  } = settings;

  if (!Number.isInteger(diskSpaceAlertThreshold) || diskSpaceAlertThreshold < 1 || diskSpaceAlertThreshold > 99) {
    return 'Disk space alert threshold must be between 1 and 99';
  }

  if (typeof enableAutoCleanup !== 'boolean') {
    return 'Enable auto cleanup must be a boolean';
  }

  if (!Number.isInteger(cleanupThresholdGB) || cleanupThresholdGB < 1) {
    return 'Cleanup threshold must be a positive integer';
  }

  if (!Number.isInteger(minAgeForCleanupDays) || minAgeForCleanupDays < 1) {
    return 'Minimum age for cleanup must be a positive integer';
  }

  if (typeof keepMetadataOnCleanup !== 'boolean') {
    return 'Keep metadata on cleanup must be a boolean';
  }

  return null;
}

export function validateNotificationSettings(settings: NotificationSettings): string | null {
  const {
    enableEmailNotifications,
    emailAddress,
    enableDesktopNotifications,
    enableDiscordWebhook,
    discordWebhookUrl,
    notifyOnDownloadStart,
    notifyOnDownloadComplete,
    notifyOnError,
    notifyOnStorageAlert
  } = settings;

  if (typeof enableEmailNotifications !== 'boolean') {
    return 'Enable email notifications must be a boolean';
  }

  if (enableEmailNotifications && (!emailAddress || !emailAddress.includes('@'))) {
    return 'Valid email address is required when email notifications are enabled';
  }

  if (typeof enableDesktopNotifications !== 'boolean') {
    return 'Enable desktop notifications must be a boolean';
  }

  if (typeof enableDiscordWebhook !== 'boolean') {
    return 'Enable Discord webhook must be a boolean';
  }

  if (enableDiscordWebhook && (!discordWebhookUrl || !discordWebhookUrl.startsWith('https://discord.com/api/webhooks/'))) {
    return 'Valid Discord webhook URL is required when Discord notifications are enabled';
  }

  const booleanFlags = [
    notifyOnDownloadStart,
    notifyOnDownloadComplete,
    notifyOnError,
    notifyOnStorageAlert
  ];

  if (!booleanFlags.every(flag => typeof flag === 'boolean')) {
    return 'All notification flags must be boolean values';
  }

  return null;
}

export function validateSettings(settings: AppSettings): string | null {
  // Validate structure
  const requiredKeys = ['downloads', 'fileOrganization', 'storage', 'notifications'];
  for (const key of requiredKeys) {
    if (!(key in settings)) {
      return `Missing required settings section: ${key}`;
    }
  }

  // Validate each section
  const downloadError = validateDownloadSettings(settings.downloads);
  if (downloadError) return `Downloads settings error: ${downloadError}`;

  const fileOrgError = validateFileOrganizationSettings(settings.fileOrganization);
  if (fileOrgError) return `File organization settings error: ${fileOrgError}`;

  const storageError = validateStorageSettings(settings.storage);
  if (storageError) return `Storage settings error: ${storageError}`;

  const notificationError = validateNotificationSettings(settings.notifications);
  if (notificationError) return `Notification settings error: ${notificationError}`;

  return null;
}

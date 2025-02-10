// Filepath: frontend/src/pages/settings/hooks/useSettings.ts

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { SettingsState, StorageStats } from '../types';

const defaultSettings: SettingsState = {
  downloads: {
    downloadPath: '',
    tempStorageLocation: '',
    concurrentDownloadLimit: 3,
    bandwidthThrottle: 0,
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
  }
};

export function useSettings() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadStorageStats();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await api.getSystemSettings();
      setSettings(response);
      setError(null);
    } catch (err) {
      setError('Failed to load settings');
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStorageStats = async () => {
    try {
      const stats = await api.getStorageStats();
      setStorageStats(stats);
    } catch (err) {
      console.error('Error loading storage stats:', err);
    }
  };

  const saveSettings = async (newSettings: SettingsState) => {
    setSaving(true);
    try {
      await api.updateSystemSettings(newSettings);
      setSettings(newSettings);
      setError(null);
      return true;
    } catch (err) {
      setError('Failed to save settings');
      console.error('Error saving settings:', err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const selectFolder = async (type: 'download' | 'temp'): Promise<string | null> => {
    try {
      const response = await fetch('/api/system/select-folder', {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to select folder');

      const { path } = await response.json();

      setSettings(prev => ({
        ...prev,
        downloads: {
          ...prev.downloads,
          [type === 'download' ? 'downloadPath' : 'tempStorageLocation']: path
        }
      }));

      return path;
    } catch (err) {
      setError('Failed to select folder');
      console.error('Error selecting folder:', err);
      return null;
    }
  };

  const runCleanup = async () => {
    try {
      await api.runStorageCleanup();
      await loadStorageStats();
    } catch (err) {
      setError('Failed to run cleanup');
      console.error('Error running cleanup:', err);
    }
  };

  return {
    settings,
    storageStats,
    loading,
    saving,
    error,
    setSettings,
    saveSettings,
    selectFolder,
    runCleanup,
    refreshStorageStats: loadStorageStats
  };
}

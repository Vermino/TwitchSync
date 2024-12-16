// frontend/src/pages/Settings.tsx

import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from '@/components/ui/use-toast';
import {
  Save,
  FolderOpen,
  HardDrive,
  Bell,
  Download,
  FolderTree,
  AlertTriangle,
  RefreshCw,
  Settings as SettingsIcon,
  Trash2,
  Check
} from 'lucide-react';

interface SettingsState {
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
  },
};

const Settings: React.FC = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [storageStats, setStorageStats] = useState<{
    totalSpace: number;
    usedSpace: number;
    freeSpace: number;
  } | null>(null);

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
      setError('Failed to load settings. Please try again.');
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
      toast({
        title: "Error",
        description: "Failed to load storage statistics",
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSystemSettings(settings);

      setSuccessMessage('Settings saved successfully');
      setError(null);
      toast({
        title: "Success",
        description: "Settings saved successfully",
      });

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError('Failed to save settings. Please try again.');
      console.error('Error saving settings:', err);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePathSelect = async (type: 'download' | 'temp') => {
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
    } catch (err) {
      setError('Failed to select folder');
      console.error('Error selecting folder:', err);
    }
  };

  const formatBytes = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-purple-600" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-600 rounded-lg flex items-center gap-2">
          <Check className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Download Settings */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center gap-2 mb-6">
            <Download className="w-6 h-6 text-purple-600" />
            <h2 className="text-xl font-semibold">Download Settings</h2>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Download Path
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.downloads.downloadPath}
                  readOnly
                  className="flex-1 p-2 border rounded-lg bg-gray-50"
                />
                <button
                  onClick={() => handlePathSelect('download')}
                  className="px-3 py-2 border rounded-lg hover:bg-gray-50"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Temporary Storage Location
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.downloads.tempStorageLocation}
                  readOnly
                  className="flex-1 p-2 border rounded-lg bg-gray-50"
                />
                <button
                  onClick={() => handlePathSelect('temp')}
                  className="px-3 py-2 border rounded-lg hover:bg-gray-50"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Concurrent Download Limit
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={settings.downloads.concurrentDownloadLimit}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  downloads: {
                    ...prev.downloads,
                    concurrentDownloadLimit: parseInt(e.target.value)
                  }
                }))}
                className="w-20 p-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Bandwidth Throttle (KB/s, 0 for unlimited)
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={settings.downloads.bandwidthThrottle}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  downloads: {
                    ...prev.downloads,
                    bandwidthThrottle: parseInt(e.target.value)
                  }
                }))}
                className="w-32 p-2 border rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* File Organization */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center gap-2 mb-6">
            <FolderTree className="w-6 h-6 text-purple-600" />
            <h2 className="text-xl font-semibold">File Organization</h2>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Filename Template
              </label>
              <input
                type="text"
                value={settings.fileOrganization.filenameTemplate}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  fileOrganization: {
                    ...prev.fileOrganization,
                    filenameTemplate: e.target.value
                  }
                }))}
                className="w-full p-2 border rounded-lg"
              />
              <p className="mt-1 text-sm text-gray-500">
                Available variables: {'{date}'}, {'{channel}'}, {'{title}'}, {'{game}'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Folder Structure
              </label>
              <select
                value={settings.fileOrganization.folderStructure}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  fileOrganization: {
                    ...prev.fileOrganization,
                    folderStructure: e.target.value as 'flat' | 'by_channel' | 'by_game' | 'by_date'
                  }
                }))}
                className="w-full p-2 border rounded-lg"
              >
                <option value="flat">Flat (no subfolders)</option>
                <option value="by_channel">Organize by Channel</option>
                <option value="by_game">Organize by Game</option>
                <option value="by_date">Organize by Date</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="createChannelFolders"
                checked={settings.fileOrganization.createChannelFolders}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  fileOrganization: {
                    ...prev.fileOrganization,
                    createChannelFolders: e.target.checked
                  }
                }))}
                className="rounded border-gray-300"
              />
              <label htmlFor="createChannelFolders">
                Create channel subfolders
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="createGameFolders"
                checked={settings.fileOrganization.createGameFolders}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  fileOrganization: {
                    ...prev.fileOrganization,
                    createGameFolders: e.target.checked
                  }
                }))}
                className="rounded border-gray-300"
              />
              <label htmlFor="createGameFolders">
                Create game subfolders
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Metadata Format
              </label>
              <select
                value={settings.fileOrganization.metadataFormat}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  fileOrganization: {
                    ...prev.fileOrganization,
                    metadataFormat: e.target.value as 'json' | 'yaml' | 'nfo'
                  }
                }))}
                className="w-full p-2 border rounded-lg"
              >
                <option value="json">JSON</option>
                <option value="yaml">YAML</option>
                <option value="nfo">NFO</option>
              </select>
            </div>
          </div>
        </div>

        {/* Storage Management */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center gap-2 mb-6">
            <HardDrive className="w-6 h-6 text-purple-600" />
            <h2 className="text-xl font-semibold">Storage Management</h2>
          </div>

          {storageStats && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Total Space:</span>
                <span className="font-medium">{formatBytes(storageStats.totalSpace)}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Used Space:</span>
                <span className="font-medium">{formatBytes(storageStats.usedSpace)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Free Space:</span>
                <span className="font-medium">{formatBytes(storageStats.freeSpace)}</span>
              </div>
              <div className="mt-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 rounded-full h-2 transition-all duration-300"
                    style={{ width: `${(storageStats.usedSpace / storageStats.totalSpace) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Disk Space Alert Threshold (%)
              </label>
              <input
                type="number"
                min={1}
                max={99}
                value={settings.storage.diskSpaceAlertThreshold}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  storage: {
                    ...prev.storage,
                    diskSpaceAlertThreshold: parseInt(e.target.value)
                  }
                }))}
                className="w-20 p-2 border rounded-lg"
              />
              <p className="mt-1 text-sm text-gray-500">
                Alert when free space falls below this percentage
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enableAutoCleanup"
                checked={settings.storage.enableAutoCleanup}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  storage: {
                    ...prev.storage,
                    enableAutoCleanup: e.target.checked
                  }
                }))}
                className="rounded border-gray-300"
              />
              <label htmlFor="enableAutoCleanup">
                Enable automatic cleanup
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Cleanup Threshold (GB)
              </label>
              <input
                type="number"
                min={1}
                value={settings.storage.cleanupThresholdGB}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  storage: {
                    ...prev.storage,
                    cleanupThresholdGB: parseInt(e.target.value)
                  }
                }))}
                disabled={!settings.storage.enableAutoCleanup}
                className="w-24 p-2 border rounded-lg disabled:opacity-50 disabled:bg-gray-100"
              />
              <p className="mt-1 text-sm text-gray-500">
                Start cleanup when used space exceeds this amount
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Minimum Age for Cleanup (days)
              </label>
              <input
                type="number"
                min={1}
                value={settings.storage.minAgeForCleanupDays}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  storage: {
                    ...prev.storage,
                    minAgeForCleanupDays: parseInt(e.target.value)
                  }
                }))}
                disabled={!settings.storage.enableAutoCleanup}
                className="w-24 p-2 border rounded-lg disabled:opacity-50 disabled:bg-gray-100"
              />
              <p className="mt-1 text-sm text-gray-500">
                Only clean up VODs older than this
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="keepMetadata"
                checked={settings.storage.keepMetadataOnCleanup}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  storage: {
                    ...prev.storage,
                    keepMetadataOnCleanup: e.target.checked
                  }
                }))}
                disabled={!settings.storage.enableAutoCleanup}
                className="rounded border-gray-300"
              />
              <label htmlFor="keepMetadata">
                Keep metadata files when cleaning up VODs
              </label>
            </div>

            <div className="pt-4 border-t">
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to run cleanup now? This will delete VODs according to your cleanup settings.')) {
                    // TODO: Implement manual cleanup
                  }
                }}
                disabled={!settings.storage.enableAutoCleanup}
                className="flex items-center gap-2 px-4 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <Trash2 className="w-5 h-5" />
                Run Cleanup Now
              </button>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center gap-2 mb-6">
            <Bell className="w-6 h-6 text-purple-600" />
            <h2 className="text-xl font-semibold">Notification Settings</h2>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="enableEmailNotifications"
                  checked={settings.notifications.enableEmailNotifications}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    notifications: {
                      ...prev.notifications,
                      enableEmailNotifications: e.target.checked
                    }
                  }))}
                  className="rounded border-gray-300"
                />
                <label htmlFor="enableEmailNotifications">
                  Enable email notifications
                </label>
              </div>

              {settings.notifications.enableEmailNotifications && (
                <input
                  type="email"
                  value={settings.notifications.emailAddress}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    notifications: {
                      ...prev.notifications,
                      emailAddress: e.target.value
                    }
                  }))}
                  placeholder="Enter email address"
                  className="w-full p-2 border rounded-lg"
                />
              )}
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enableDesktopNotifications"
                checked={settings.notifications.enableDesktopNotifications}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  notifications: {
                    ...prev.notifications,
                    enableDesktopNotifications: e.target.checked
                  }
                }))}
                className="rounded border-gray-300"
              />
              <label htmlFor="enableDesktopNotifications">
                Enable desktop notifications
              </label>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="enableDiscordWebhook"
                  checked={settings.notifications.enableDiscordWebhook}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    notifications: {
                      ...prev.notifications,
                      enableDiscordWebhook: e.target.checked
                    }
                  }))}
                  className="rounded border-gray-300"
                />
                <label htmlFor="enableDiscordWebhook">
                  Enable Discord webhook notifications
                </label>
              </div>

              {settings.notifications.enableDiscordWebhook && (
                <input
                  type="url"
                  value={settings.notifications.discordWebhookUrl}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    notifications: {
                      ...prev.notifications,
                      discordWebhookUrl: e.target.value
                    }
                  }))}
                  placeholder="Enter Discord webhook URL"
                  className="w-full p-2 border rounded-lg"
                />
              )}
            </div>

            <div className="space-y-3 pt-4 border-t">
              <div className="text-sm font-medium mb-2">Notify me when:</div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="notifyOnDownloadStart"
                  checked={settings.notifications.notifyOnDownloadStart}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    notifications: {
                      ...prev.notifications,
                      notifyOnDownloadStart: e.target.checked
                    }
                  }))}
                  className="rounded border-gray-300"
                />
                <label htmlFor="notifyOnDownloadStart">
                  Download starts
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="notifyOnDownloadComplete"
                  checked={settings.notifications.notifyOnDownloadComplete}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    notifications: {
                      ...prev.notifications,
                      notifyOnDownloadComplete: e.target.checked
                    }
                  }))}
                  className="rounded border-gray-300"
                />
                <label htmlFor="notifyOnDownloadComplete">
                  Download completes
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="notifyOnError"
                  checked={settings.notifications.notifyOnError}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    notifications: {
                      ...prev.notifications,
                      notifyOnError: e.target.checked
                    }
                  }))}
                  className="rounded border-gray-300"
                />
                <label htmlFor="notifyOnError">
                  Errors occur
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="notifyOnStorageAlert"
                  checked={settings.notifications.notifyOnStorageAlert}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    notifications: {
                      ...prev.notifications,
                      notifyOnStorageAlert: e.target.checked
                    }
                  }))}
                  className="rounded border-gray-300"
                />
                <label htmlFor="notifyOnStorageAlert">
                  Storage space is low
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;

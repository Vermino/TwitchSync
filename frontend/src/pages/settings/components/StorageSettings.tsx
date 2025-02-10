// Filepath: frontend/src/pages/settings/components/StorageSettings.tsx

import React from 'react';
import { HardDrive, Trash2 } from 'lucide-react';
import { StorageSettings as StorageSettingsType, StorageStats } from '../types';
import { formatBytes } from '../utils/format';

interface StorageSettingsProps {
  settings: StorageSettingsType;
  storageStats: StorageStats | null;
  onSettingsChange: (settings: StorageSettingsType) => void;
  onCleanupRequest: () => Promise<void>;
}

const StorageSettings: React.FC<StorageSettingsProps> = ({
  settings,
  storageStats,
  onSettingsChange,
  onCleanupRequest
}) => {
  const handleCleanupRequest = async () => {
    if (window.confirm('Are you sure you want to run cleanup now? This will delete VODs according to your cleanup settings.')) {
      await onCleanupRequest();
    }
  };

  return (
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
            value={settings.diskSpaceAlertThreshold}
            onChange={(e) => onSettingsChange({
              ...settings,
              diskSpaceAlertThreshold: parseInt(e.target.value)
            })}
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
            checked={settings.enableAutoCleanup}
            onChange={(e) => onSettingsChange({
              ...settings,
              enableAutoCleanup: e.target.checked
            })}
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
            value={settings.cleanupThresholdGB}
            onChange={(e) => onSettingsChange({
              ...settings,
              cleanupThresholdGB: parseInt(e.target.value)
            })}
            disabled={!settings.enableAutoCleanup}
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
            value={settings.minAgeForCleanupDays}
            onChange={(e) => onSettingsChange({
              ...settings,
              minAgeForCleanupDays: parseInt(e.target.value)
            })}
            disabled={!settings.enableAutoCleanup}
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
            checked={settings.keepMetadataOnCleanup}
            onChange={(e) => onSettingsChange({
              ...settings,
              keepMetadataOnCleanup: e.target.checked
            })}
            disabled={!settings.enableAutoCleanup}
            className="rounded border-gray-300"
          />
          <label htmlFor="keepMetadata">
            Keep metadata files when cleaning up VODs
          </label>
        </div>

        <div className="pt-4 border-t">
          <button
            onClick={handleCleanupRequest}
            disabled={!settings.enableAutoCleanup}
            className="flex items-center gap-2 px-4 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <Trash2 className="w-5 h-5" />
            Run Cleanup Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default StorageSettings;

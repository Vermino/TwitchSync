// Filepath: frontend/src/pages/settings/components/DownloadSettings.tsx

import React from 'react';
import { Download, FolderOpen } from 'lucide-react';
import { DownloadSettings as DownloadSettingsType } from '../types';

interface DownloadSettingsProps {
  settings: DownloadSettingsType;
  onSettingsChange: (settings: DownloadSettingsType) => void;
  onPathSelect: (type: 'download' | 'temp') => void;
}

const DownloadSettings: React.FC<DownloadSettingsProps> = ({
  settings,
  onSettingsChange,
  onPathSelect
}) => {
  return (
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
              value={settings.downloadPath}
              readOnly
              className="flex-1 p-2 border rounded-lg bg-gray-50"
            />
            <button
              onClick={() => onPathSelect('download')}
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
              value={settings.tempStorageLocation}
              readOnly
              className="flex-1 p-2 border rounded-lg bg-gray-50"
            />
            <button
              onClick={() => onPathSelect('temp')}
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
            value={settings.concurrentDownloadLimit}
            onChange={(e) => onSettingsChange({
              ...settings,
              concurrentDownloadLimit: parseInt(e.target.value)
            })}
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
            value={settings.bandwidthThrottle}
            onChange={(e) => onSettingsChange({
              ...settings,
              bandwidthThrottle: parseInt(e.target.value)
            })}
            className="w-32 p-2 border rounded-lg"
          />
        </div>
      </div>
    </div>
  );
};

export default DownloadSettings;

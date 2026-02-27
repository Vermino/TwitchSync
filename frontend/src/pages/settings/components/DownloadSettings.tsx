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

        <div>
          <label className="block text-sm font-medium mb-2">
            Global Default Video Quality
          </label>
          <select
            value={settings.defaultQuality || 'source'}
            onChange={(e) => onSettingsChange({
              ...settings,
              defaultQuality: e.target.value
            })}
            className="w-48 p-2 border rounded-lg bg-white"
          >
            <option value="source">Source (Best)</option>
            <option value="1080p60">1080p 60fps</option>
            <option value="1080p">1080p</option>
            <option value="720p60">720p 60fps</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
            <option value="360p">360p</option>
            <option value="160p">160p</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Used as a fallback if no specific quality is set for a task or channel.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DownloadSettings;

// Filepath: frontend/src/pages/settings/components/DownloadSettings.tsx

import React, { useState } from 'react';
import { Download, FolderOpen } from 'lucide-react';
import { DownloadSettings as DownloadSettingsType } from '../types';
import FileBrowser from '@/components/FileBrowser';

interface DownloadSettingsProps {
  settings: DownloadSettingsType;
  onSettingsChange: (settings: DownloadSettingsType) => void;
  onPathSelect: (type: 'download' | 'temp') => void;
}

const DownloadSettings: React.FC<DownloadSettingsProps> = ({
  settings,
  onSettingsChange,
}) => {
  const [browser, setBrowser] = useState<{ open: boolean; type: 'download' | 'temp' }>({
    open: false,
    type: 'download',
  });

  const openBrowser = (type: 'download' | 'temp') => {
    setBrowser({ open: true, type });
  };

  const handleSelect = (path: string) => {
    if (browser.type === 'download') {
      onSettingsChange({ ...settings, downloadPath: path });
    } else {
      onSettingsChange({ ...settings, tempStorageLocation: path });
    }
    setBrowser(b => ({ ...b, open: false }));
  };

  const currentBrowserPath =
    browser.type === 'download' ? settings.downloadPath : settings.tempStorageLocation;

  return (
    <>
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <Download className="w-6 h-6 text-purple-600" />
          <h2 className="text-xl font-semibold">Download Settings</h2>
        </div>

        <div className="space-y-6">
          {/* Download Path */}
          <div>
            <label className="block text-sm font-medium mb-2">Download Path</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.downloadPath}
                onChange={e => onSettingsChange({ ...settings, downloadPath: e.target.value })}
                placeholder="e.g. /data/vods or C:\TwitchSync\Downloads"
                className="flex-1 p-2 border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
              <button
                onClick={() => openBrowser('download')}
                title="Browse filesystem"
                className="px-3 py-2 border rounded-lg hover:bg-purple-50 hover:border-purple-400 text-gray-600 hover:text-purple-600 transition-colors"
              >
                <FolderOpen className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Where completed VODs are saved. In Docker, set <code>STORAGE_PATH</code> env var to override.
            </p>
          </div>

          {/* Temp Storage */}
          <div>
            <label className="block text-sm font-medium mb-2">Temporary Storage Location</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.tempStorageLocation}
                onChange={e => onSettingsChange({ ...settings, tempStorageLocation: e.target.value })}
                placeholder="e.g. /tmp/twitchsync"
                className="flex-1 p-2 border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
              <button
                onClick={() => openBrowser('temp')}
                title="Browse filesystem"
                className="px-3 py-2 border rounded-lg hover:bg-purple-50 hover:border-purple-400 text-gray-600 hover:text-purple-600 transition-colors"
              >
                <FolderOpen className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Used during active downloads. Can be a fast local SSD even if final storage is on a NAS.
            </p>
          </div>

          {/* Concurrent downloads */}
          <div>
            <label className="block text-sm font-medium mb-2">Concurrent Download Limit</label>
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

          {/* Bandwidth throttle */}
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

          {/* Quality */}
          <div>
            <label className="block text-sm font-medium mb-2">Global Default Video Quality</label>
            <select
              value={settings.defaultQuality || 'source'}
              onChange={(e) => onSettingsChange({ ...settings, defaultQuality: e.target.value })}
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

      {browser.open && (
        <FileBrowser
          initialPath={currentBrowserPath}
          title={browser.type === 'download' ? 'Select Download Path' : 'Select Temp Storage'}
          onSelect={handleSelect}
          onClose={() => setBrowser(b => ({ ...b, open: false }))}
        />
      )}
    </>
  );
};

export default DownloadSettings;

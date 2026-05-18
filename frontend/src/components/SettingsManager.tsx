import React, { useState } from 'react';
import { Settings, Save, RotateCcw, FolderOpen } from 'lucide-react';

interface WatchSettings {
  downloadPath: string;
  tempPath: string;
  maxConcurrentDownloads: number;
  createChannelSubfolders: boolean;
  createGameSubfolders: boolean;
  autoStartDownload: boolean;
  notifyOnComplete: boolean;
}

const SettingsManager: React.FC = () => {
  const [settings, setSettings] = useState<WatchSettings>({
    downloadPath: '',
    tempPath: '',
    maxConcurrentDownloads: 3,
    createChannelSubfolders: true,
    createGameSubfolders: true,
    autoStartDownload: true,
    notifyOnComplete: true
  });

  const handlePathSelect = async (type: 'download' | 'temp') => {
    try {
      const response = await fetch('/api/system/select-folder', {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to select folder');
      const { path } = await response.json();

      setSettings(prev => ({
        ...prev,
        [type === 'download' ? 'downloadPath' : 'tempPath']: path
      }));
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  };

  const handleSave = async () => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) throw new Error('Failed to save settings');
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const handleReset = () => {
    setSettings({
      downloadPath: '',
      tempPath: '',
      maxConcurrentDownloads: 3,
      createChannelSubfolders: true,
      createGameSubfolders: true,
      autoStartDownload: true,
      notifyOnComplete: true
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-purple-600" />
          <h2 className="text-xl font-semibold">Watch Settings</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Paths */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Download Path</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.downloadPath}
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
            <label className="block text-sm font-medium mb-2">Temporary Path</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.tempPath}
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
        </div>

        {/* Download Settings */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Maximum Concurrent Downloads
          </label>
          <input
            type="number"
            value={settings.maxConcurrentDownloads}
            onChange={(e) => setSettings(prev => ({
              ...prev,
              maxConcurrentDownloads: parseInt(e.target.value)
            }))}
            min="1"
            max="10"
            className="w-20 p-2 border rounded-lg"
          />
        </div>

        {/* Organization Settings */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="channelFolders"
              checked={settings.createChannelSubfolders}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                createChannelSubfolders: e.target.checked
              }))}
              className="rounded border-gray-300 text-purple-600"
            />
            <label htmlFor="channelFolders">
              Create subfolders for channels
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="gameFolders"
              checked={settings.createGameSubfolders}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                createGameSubfolders: e.target.checked
              }))}
              className="rounded border-gray-300 text-purple-600"
            />
            <label htmlFor="gameFolders">
              Create subfolders for games
            </label>
          </div>
        </div>

        {/* Automation Settings */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="autoStart"
              checked={settings.autoStartDownload}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                autoStartDownload: e.target.checked
              }))}
              className="rounded border-gray-300 text-purple-600"
            />
            <label htmlFor="autoStart">
              Automatically start download when VOD detected
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="notify"
              checked={settings.notifyOnComplete}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                notifyOnComplete: e.target.checked
              }))}
              className="rounded border-gray-300 text-purple-600"
            />
            <label htmlFor="notify">
              Show notification when download completes
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsManager;

// Filepath: frontend/src/pages/settings/index.tsx

import React from 'react';
import {
  Save,
  Settings as SettingsIcon,
  RefreshCw,
  AlertTriangle,
  Check
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useSettings } from './hooks/useSettings';
import DownloadSettings from './components/DownloadSettings';
import FileOrganizationSettings from './components/FileOrganizationSettings';
import StorageSettings from './components/StorageSettings';
import NotificationSettings from './components/NotificationSettings';

const Settings: React.FC = () => {
  const { toast } = useToast();
  const {
    settings,
    storageStats,
    loading,
    saving,
    error,
    setSettings,
    saveSettings,
    selectFolder,
    runCleanup,
  } = useSettings();

  const handleSave = async () => {
    const success = await saveSettings(settings);

    if (success) {
      toast({
        title: "Success",
        description: "Settings saved successfully",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive"
      });
    }
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <DownloadSettings
          settings={settings.downloads}
          onSettingsChange={(downloadSettings) => setSettings(prev => ({
            ...prev,
            downloads: downloadSettings
          }))}
          onPathSelect={selectFolder}
        />

        <FileOrganizationSettings
          settings={settings.fileOrganization}
          onSettingsChange={(fileOrgSettings) => setSettings(prev => ({
            ...prev,
            fileOrganization: fileOrgSettings
          }))}
        />

        <StorageSettings
          settings={settings.storage}
          storageStats={storageStats}
          onSettingsChange={(storageSettings) => setSettings(prev => ({
            ...prev,
            storage: storageSettings
          }))}
          onCleanupRequest={runCleanup}
        />

        <NotificationSettings
          settings={settings.notifications}
          onSettingsChange={(notificationSettings) => setSettings(prev => ({
            ...prev,
            notifications: notificationSettings
          }))}
        />
      </div>
    </div>
  );
};

export default Settings;

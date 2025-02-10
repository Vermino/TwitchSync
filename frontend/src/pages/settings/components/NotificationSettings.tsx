// Filepath: frontend/src/pages/settings/components/NotificationSettings.tsx

import React from 'react';
import { Bell } from 'lucide-react';
import { NotificationSettings as NotificationSettingsType } from '../types';

interface NotificationSettingsProps {
  settings: NotificationSettingsType;
  onSettingsChange: (settings: NotificationSettingsType) => void;
}

const NotificationSettings: React.FC<NotificationSettingsProps> = ({
  settings,
  onSettingsChange
}) => {
  return (
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
              checked={settings.enableEmailNotifications}
              onChange={(e) => onSettingsChange({
                ...settings,
                enableEmailNotifications: e.target.checked
              })}
              className="rounded border-gray-300"
            />
            <label htmlFor="enableEmailNotifications">
              Enable email notifications
            </label>
          </div>

          {settings.enableEmailNotifications && (
            <input
              type="email"
              value={settings.emailAddress}
              onChange={(e) => onSettingsChange({
                ...settings,
                emailAddress: e.target.value
              })}
              placeholder="Enter email address"
              className="w-full p-2 border rounded-lg"
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="enableDesktopNotifications"
            checked={settings.enableDesktopNotifications}
            onChange={(e) => onSettingsChange({
              ...settings,
              enableDesktopNotifications: e.target.checked
            })}
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
              checked={settings.enableDiscordWebhook}
              onChange={(e) => onSettingsChange({
                ...settings,
                enableDiscordWebhook: e.target.checked
              })}
              className="rounded border-gray-300"
            />
            <label htmlFor="enableDiscordWebhook">
              Enable Discord webhook notifications
            </label>
          </div>

          {settings.enableDiscordWebhook && (
            <input
              type="url"
              value={settings.discordWebhookUrl}
              onChange={(e) => onSettingsChange({
                ...settings,
                discordWebhookUrl: e.target.value
              })}
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
              checked={settings.notifyOnDownloadStart}
              onChange={(e) => onSettingsChange({
                ...settings,
                notifyOnDownloadStart: e.target.checked
              })}
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
              checked={settings.notifyOnDownloadComplete}
              onChange={(e) => onSettingsChange({
                ...settings,
                notifyOnDownloadComplete: e.target.checked
              })}
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
              checked={settings.notifyOnError}
              onChange={(e) => onSettingsChange({
                ...settings,
                notifyOnError: e.target.checked
              })}
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
              checked={settings.notifyOnStorageAlert}
              onChange={(e) => onSettingsChange({
                ...settings,
                notifyOnStorageAlert: e.target.checked
              })}
              className="rounded border-gray-300"
            />
            <label htmlFor="notifyOnStorageAlert">
              Storage space is low
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettings;

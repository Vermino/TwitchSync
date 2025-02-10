// Filepath: frontend/src/pages/settings/components/FileOrganizationSettings.tsx

import React from 'react';
import { FolderTree } from 'lucide-react';
import { FileOrganizationSettings as FileOrganizationSettingsType } from '../types';

interface FileOrganizationSettingsProps {
  settings: FileOrganizationSettingsType;
  onSettingsChange: (settings: FileOrganizationSettingsType) => void;
}

const FileOrganizationSettings: React.FC<FileOrganizationSettingsProps> = ({
  settings,
  onSettingsChange
}) => {
  return (
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
            value={settings.filenameTemplate}
            onChange={(e) => onSettingsChange({
              ...settings,
              filenameTemplate: e.target.value
            })}
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
            value={settings.folderStructure}
            onChange={(e) => onSettingsChange({
              ...settings,
              folderStructure: e.target.value as FileOrganizationSettingsType['folderStructure']
            })}
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
            checked={settings.createChannelFolders}
            onChange={(e) => onSettingsChange({
              ...settings,
              createChannelFolders: e.target.checked
            })}
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
            checked={settings.createGameFolders}
            onChange={(e) => onSettingsChange({
              ...settings,
              createGameFolders: e.target.checked
            })}
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
            value={settings.metadataFormat}
            onChange={(e) => onSettingsChange({
              ...settings,
              metadataFormat: e.target.value as 'json' | 'yaml' | 'nfo'
            })}
            className="w-full p-2 border rounded-lg"
          >
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
            <option value="nfo">NFO</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default FileOrganizationSettings;

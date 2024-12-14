import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X, Plus, AlertCircle, Users, Gamepad2, Clock,
  HardDrive, Calendar, Settings, Check
} from 'lucide-react';
import { api } from '../lib/api';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';

interface Channel {
  id: number;
  username: string;
  display_name?: string;
  profile_image_url?: string;
}

interface Game {
  id: number;
  name: string;
  box_art_url?: string;
}

interface Task {
  id: number;
  name: string;
  description: string | null;
  task_type: 'channel' | 'game' | 'combined';
  channel_ids: number[];
  game_ids: number[];
  schedule_type: 'interval' | 'cron' | 'manual';
  schedule_value: string;
  storage_limit_gb: number | null;
  retention_days: number | null;
  auto_delete: boolean;
  priority: number;
}

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  task?: Task | null;
}

const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  task
}) => {
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    task_type: 'combined',
    channel_ids: [] as number[],
    game_ids: [] as number[],
    schedule_type: 'interval',
    schedule_value: '3600',
    storage_limit_gb: '',
    retention_days: '',
    auto_delete: false,
    priority: 1
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'channels' | 'games' | 'settings'>('channels');

  // Fetch data
  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.getChannels()
  });

  const { data: games } = useQuery({
    queryKey: ['games'],
    queryFn: () => api.getGames()
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen && task) {
      setFormData({
        name: task.name,
        description: task.description || '',
        task_type: task.task_type,
        channel_ids: task.channel_ids,
        game_ids: task.game_ids,
        schedule_type: task.schedule_type,
        schedule_value: task.schedule_value,
        storage_limit_gb: task.storage_limit_gb?.toString() || '',
        retention_days: task.retention_days?.toString() || '',
        auto_delete: task.auto_delete,
        priority: task.priority
      });
    }
  }, [isOpen, task]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (formData.channel_ids.length === 0 && formData.game_ids.length === 0) {
      newErrors.selection = 'Select at least one channel or game';
    }

    if (formData.schedule_type !== 'manual' && !formData.schedule_value) {
      newErrors.schedule = 'Schedule value is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit({
        ...formData,
        storage_limit_gb: formData.storage_limit_gb ? parseInt(formData.storage_limit_gb) : null,
        retention_days: formData.retention_days ? parseInt(formData.retention_days) : null
      });
    }
  };

  const handleChannelToggle = (channelId: number) => {
    setFormData(prev => ({
      ...prev,
      channel_ids: prev.channel_ids.includes(channelId)
        ? prev.channel_ids.filter(id => id !== channelId)
        : [...prev.channel_ids, channelId]
    }));
  };

  const handleGameToggle = (gameId: number) => {
    setFormData(prev => ({
      ...prev,
      game_ids: prev.game_ids.includes(gameId)
        ? prev.game_ids.filter(id => id !== gameId)
        : [...prev.game_ids, gameId]
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header with selection summary */}
        <div className="flex items-center justify-between p-4 border-b bg-white">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">
              {task ? 'Edit Task' : 'Create New Task'}
            </h2>
            <div className="flex gap-3 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {formData.channel_ids.length} channels
              </span>
              <span className="flex items-center gap-1.5">
                <Gamepad2 className="w-4 h-4" />
                {formData.game_ids.length} games
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 p-2"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Basic Info */}
        <div className="p-4 space-y-4 bg-white border-b">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Task Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Enter task name"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={2}
              placeholder="Enter task description"
            />
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="border-b bg-white">
          <div className="flex gap-2 p-2">
            <button
              onClick={() => setActiveTab('channels')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${activeTab === 'channels' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Users className="w-4 h-4" />
              Channels
            </button>
            <button
              onClick={() => setActiveTab('games')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${activeTab === 'games' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Gamepad2 className="w-4 h-4" />
              Games
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${activeTab === 'settings' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="overflow-y-auto flex-1" style={{ maxHeight: 'calc(90vh - 400px)' }}>
          {activeTab === 'channels' && (
            <div className="p-4 grid grid-cols-2 gap-4">
              {channels?.map(channel => (
                <div
                  key={channel.id}
                  onClick={() => handleChannelToggle(channel.id)}
                  className={`relative bg-white rounded-lg border cursor-pointer transition-all hover:border-purple-300
                    ${formData.channel_ids.includes(channel.id) 
                      ? 'border-purple-500 shadow-sm' 
                      : 'border-gray-200'}`}
                >
                  <div className="p-4 flex items-center gap-3">
                    <Avatar className="w-12 h-12 rounded-full">
                      <AvatarImage
                        src={channel.profile_image_url}
                        alt={channel.display_name || channel.username}
                      />
                      <AvatarFallback>
                        {(channel.display_name || channel.username)[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">
                        {channel.display_name || channel.username}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">@{channel.username}</p>
                    </div>
                    {formData.channel_ids.includes(channel.id) && (
                      <div className="absolute top-2 right-2 text-purple-600">
                        <Check className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'games' && (
            <div className="p-4 grid grid-cols-3 gap-4">
              {games?.map(game => (
                <div
                  key={game.id}
                  onClick={() => handleGameToggle(game.id)}
                  className={`relative bg-white rounded-lg border cursor-pointer transition-all hover:border-purple-300
                    ${formData.game_ids.includes(game.id) 
                      ? 'border-purple-500 shadow-sm' 
                      : 'border-gray-200'}`}
                >
                  <div className="p-3">
                    <div className="aspect-video relative rounded-lg overflow-hidden bg-gray-100 mb-3">
                      <img
                        src={game.box_art_url?.replace('{width}', '285').replace('{height}', '380') ||
                             '/api/placeholder/285/380'}
                        alt={game.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <h3 className="font-medium text-sm truncate pr-6">{game.name}</h3>
                    {formData.game_ids.includes(game.id) && (
                      <div className="absolute top-2 right-2 text-purple-600">
                        <Check className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="p-4 space-y-6">
              {/* Schedule Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Schedule Type
                  </label>
                  <select
                    value={formData.schedule_type}
                    onChange={e => setFormData(prev => ({ ...prev, schedule_type: e.target.value as any }))}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="interval">Interval</option>
                    <option value="cron">Cron</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>

                {formData.schedule_type !== 'manual' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {formData.schedule_type === 'interval' ? 'Interval (seconds)' : 'Cron Expression'}
                    </label>
                    <input
                      type={formData.schedule_type === 'interval' ? 'number' : 'text'}
                      value={formData.schedule_value}
                      onChange={e => setFormData(prev => ({ ...prev, schedule_value: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder={formData.schedule_type === 'interval' ? '3600' : '0 */6 * * *'}
                    />
                    {errors.schedule_value && (
                      <p className="mt-1 text-sm text-red-600">{errors.schedule_value}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Storage Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Storage Limit (GB)
                  </label>
                  <input
                    type="number"
                    value={formData.storage_limit_gb}
                    onChange={e => setFormData(prev => ({ ...prev, storage_limit_gb: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Optional"
                  />
                  {errors.storage_limit_gb && (
                    <p className="mt-1 text-sm text-red-600">{errors.storage_limit_gb}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Retention Period (days)
                  </label>
                  <input
                    type="number"
                    value={formData.retention_days}
                    onChange={e => setFormData(prev => ({ ...prev, retention_days: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Optional"
                  />
                  {errors.retention_days && (
                    <p className="mt-1 text-sm text-red-600">{errors.retention_days}</p>
                  )}
                </div>
              </div>

              {/* Additional Settings */}
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.auto_delete}
                    onChange={e => setFormData(prev => ({ ...prev, auto_delete: e.target.checked }))}
                    className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                  />
                  <label className="ml-2 text-sm text-gray-700">
                    Auto-delete files after retention period
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority Level
                  </label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value={1}>Low</option>
                    <option value={2}>Medium-Low</option>
                    <option value={3}>Medium</option>
                    <option value={4}>Medium-High</option>
                    <option value={5}>High</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {Object.keys(errors).length > 0 && (
          <div className="px-4 py-3 bg-red-50 border-t border-red-100">
            <div className="flex items-start gap-2 text-red-800">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                {Object.values(errors).map((error, index) => (
                  <p key={index}>{error}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
          <div className="flex gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {formData.schedule_type === 'interval' &&
                `Every ${parseInt(formData.schedule_value) / 60} minutes`}
              {formData.schedule_type === 'cron' && 'Custom schedule'}
              {formData.schedule_type === 'manual' && 'Manual execution'}
            </div>
            {formData.storage_limit_gb && (
              <div className="flex items-center gap-1.5">
                <HardDrive className="w-4 h-4" />
                {formData.storage_limit_gb}GB limit
              </div>
            )}
            {formData.retention_days && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {formData.retention_days} days retention
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700
                       disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              disabled={formData.channel_ids.length === 0 && formData.game_ids.length === 0}
            >
              <Plus className="w-5 h-5" />
              {task ? 'Update Task' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;

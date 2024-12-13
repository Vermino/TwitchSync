// frontend/src/components/TaskModal.tsx

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Plus, Minus, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface Channel {
  id: number;
  username: string;
}

interface Game {
  id: number;
  name: string;
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
    task_type: 'channel',
    channel_ids: [] as number[],
    game_ids: [] as number[],
    schedule_type: 'interval',
    schedule_value: '',
    storage_limit_gb: '',
    retention_days: '',
    auto_delete: false,
    priority: 1
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch channels and games for selection
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
    if (isOpen) {
      if (task) {
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
      } else {
        setFormData({
          name: '',
          description: '',
          task_type: 'channel',
          channel_ids: [],
          game_ids: [],
          schedule_type: 'interval',
          schedule_value: '',
          storage_limit_gb: '',
          retention_days: '',
          auto_delete: false,
          priority: 1
        });
      }
      setErrors({});
    }
  }, [isOpen, task]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (formData.task_type === 'channel' && formData.channel_ids.length === 0) {
      newErrors.channel_ids = 'At least one channel must be selected';
    }

    if (formData.task_type === 'game' && formData.game_ids.length === 0) {
      newErrors.game_ids = 'At least one game must be selected';
    }

    if (formData.task_type === 'combined' &&
        formData.channel_ids.length === 0 &&
        formData.game_ids.length === 0) {
      newErrors.combined = 'At least one channel or game must be selected';
    }

    if (formData.schedule_type !== 'manual' && !formData.schedule_value) {
      newErrors.schedule_value = 'Schedule value is required';
    }

    if (formData.schedule_type === 'interval') {
      const value = parseInt(formData.schedule_value);
      if (isNaN(value) || value < 60) {
        newErrors.schedule_value = 'Interval must be at least 60 seconds';
      }
    }

    if (formData.storage_limit_gb && parseInt(formData.storage_limit_gb) <= 0) {
      newErrors.storage_limit_gb = 'Storage limit must be a positive number';
    }

    if (formData.retention_days && parseInt(formData.retention_days) <= 0) {
      newErrors.retention_days = 'Retention days must be a positive number';
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">
            {task ? 'Edit Task' : 'Create New Task'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
          {/* Basic Info */}
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
              rows={3}
              placeholder="Enter task description"
            />
          </div>

          {/* Task Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Task Type
            </label>
            <select
              value={formData.task_type}
              onChange={e => setFormData(prev => ({ ...prev, task_type: e.target.value as any }))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="channel">Channel Based</option>
              <option value="game">Game Based</option>
              <option value="combined">Combined</option>
            </select>
          </div>

          {/* Channel Selection */}
          {(formData.task_type === 'channel' || formData.task_type === 'combined') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Channels
              </label>
              <div className="border rounded-lg p-2 max-h-40 overflow-y-auto">
                {channels?.map(channel => (
                  <div key={channel.id} className="flex items-center p-2 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.channel_ids.includes(channel.id)}
                      onChange={() => handleChannelToggle(channel.id)}
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    />
                    <label className="ml-2 text-sm text-gray-700">
                      {channel.username}
                    </label>
                  </div>
                ))}
              </div>
              {errors.channel_ids && (
                <p className="mt-1 text-sm text-red-600">{errors.channel_ids}</p>
              )}
            </div>
          )}

          {/* Game Selection */}
          {(formData.task_type === 'game' || formData.task_type === 'combined') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Games
              </label>
              <div className="border rounded-lg p-2 max-h-40 overflow-y-auto">
                {games?.map(game => (
                  <div key={game.id} className="flex items-center p-2 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.game_ids.includes(game.id)}
                      onChange={() => handleGameToggle(game.id)}
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    />
                    <label className="ml-2 text-sm text-gray-700">
                      {game.name}
                    </label>
                  </div>
                ))}
              </div>
              {errors.game_ids && (
                <p className="mt-1 text-sm text-red-600">{errors.game_ids}</p>
              )}
            </div>
          )}

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

          {/* Validation Errors */}
          {errors.combined && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center text-red-800">
                <AlertCircle className="w-5 h-5 mr-2" />
                <span className="text-sm">{errors.combined}</span>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            {task ? 'Update Task' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;

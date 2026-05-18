// Filepath: frontend/src/components/TaskModal/utils/taskUtils.ts

import type { CreateTaskRequest, Channel, Game } from '@/types/task';

interface GeneratedTaskInfo {
  name: string;
  description: string;
}

export const generateTaskNameAndDescription = (
  taskData: Partial<CreateTaskRequest>,
  channels: Channel[],
  games: Game[]
): GeneratedTaskInfo => {
  const selectedChannels = channels.filter(c => taskData.channel_ids?.includes(c.id));
  const selectedGames = games.filter(g => taskData.game_ids?.includes(g.id));

  let taskType = '';
  if (selectedChannels.length > 0 && selectedGames.length > 0) {
    taskType = 'Combined';
  } else if (selectedChannels.length > 0) {
    taskType = 'Channel';
  } else if (selectedGames.length > 0) {
    taskType = 'Game';
  }

  // Generate name
  let name = taskType;
  if (selectedChannels.length > 0) {
    const channelNames = selectedChannels.map(c => c.display_name || c.username);
    if (channelNames.length === 1) {
      name += ` - ${channelNames[0]}`;
    } else {
      name += ` - ${channelNames[0]} +${channelNames.length - 1}`;
    }
  }
  if (selectedGames.length > 0) {
    const gameNames = selectedGames.map(g => g.name);
    if (gameNames.length === 1) {
      name += ` - ${gameNames[0]}`;
    } else {
      name += ` - ${gameNames[0]} +${gameNames.length - 1}`;
    }
  }

  // Generate description
  const parts: string[] = [];

  if (selectedChannels.length > 0) {
    parts.push(`Channels: ${selectedChannels.map(c => c.display_name || c.username).join(', ')}`);
  }

  if (selectedGames.length > 0) {
    parts.push(`Games: ${selectedGames.map(g => g.name).join(', ')}`);
  }

  if (taskData.schedule_type === 'interval') {
    const hours = parseInt(taskData.schedule_value || '3600') / 3600;
    parts.push(`Runs every ${hours} hours`);
  } else if (taskData.schedule_type === 'cron') {
    parts.push(`Scheduled: ${taskData.schedule_value}`);
  }

  if (taskData.storage_limit_gb) {
    parts.push(`Storage limit: ${taskData.storage_limit_gb}GB`);
  }

  if (taskData.retention_days) {
    parts.push(`Retention: ${taskData.retention_days} days`);
  }

  if (taskData.conditions?.minFollowers) {
    parts.push(`Min followers: ${taskData.conditions.minFollowers}`);
  }

  if (taskData.conditions?.minViews) {
    parts.push(`Min views: ${taskData.conditions.minViews}`);
  }

  return {
    name: name.trim() || 'New Task',
    description: parts.join(' • ')
  };
};

export const getTaskStatusColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'active':
    case 'running':
      return 'text-green-500';
    case 'pending':
      return 'text-yellow-500';
    case 'paused':
      return 'text-orange-500';
    case 'failed':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
};

export const formatTaskDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

export const validateTaskConfig = (taskData: Partial<CreateTaskRequest>): string[] => {
  const errors: string[] = [];

  if (!taskData.channel_ids?.length && !taskData.game_ids?.length) {
    errors.push('Select at least one channel or game');
  }

  if (taskData.schedule_type === 'interval') {
    const interval = parseInt(taskData.schedule_value || '0');
    if (interval < 300) {
      errors.push('Interval must be at least 5 minutes');
    }
  }

  if (taskData.retention_days && (taskData.retention_days < 1 || taskData.retention_days > 365)) {
    errors.push('Retention days must be between 1 and 365');
  }

  if (taskData.storage_limit_gb && taskData.storage_limit_gb < 0) {
    errors.push('Storage limit must be positive');
  }

  return errors;
};

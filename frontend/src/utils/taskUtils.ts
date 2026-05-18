// Filepath: frontend/src/utils/taskUtils.ts

import { Channel, Game, CreateTaskRequest } from '@/types/task';

export function generateTaskNameAndDescription(
  data: Partial<CreateTaskRequest>,
  channels: Channel[],
  games: Game[]
): { name: string; description: string } {
  const taskChannels = channels.filter(c => data.channel_ids?.includes(c.id));
  const taskGames = games.filter(g => data.game_ids?.includes(g.id));

  let name = '';
  let description = '';

  // Generate name based on type and contents
  if (data.task_type === 'channel' && taskChannels.length > 0) {
    const channelNames = taskChannels.map(c => c.display_name).join(', ');
    name = taskChannels.length === 1
      ? `Monitor Channel: ${channelNames}`
      : `Monitor Channels (${taskChannels.length})`;
  } else if (data.task_type === 'game' && taskGames.length > 0) {
    const gameNames = taskGames.map(g => g.name).join(', ');
    name = taskGames.length === 1
      ? `Monitor Game: ${gameNames}`
      : `Monitor Games (${taskGames.length})`;
  } else {
    const itemCount = (taskChannels.length + taskGames.length);
    name = `Combined Task (${itemCount} items)`;
  }

  // Add schedule info to name
  const scheduleInfo = getScheduleInfo(data);
  name += ` - ${scheduleInfo}`;

  // Generate description
  const parts: string[] = [];

  // Add channels to description
  if (taskChannels.length > 0) {
    const channelList = taskChannels.map(c => c.display_name).join(', ');
    parts.push(`Monitoring ${taskChannels.length} channel${taskChannels.length > 1 ? 's' : ''}: ${channelList}`);
  }

  // Add games to description
  if (taskGames.length > 0) {
    const gameList = taskGames.map(g => g.name).join(', ');
    parts.push(`Tracking ${taskGames.length} game${taskGames.length > 1 ? 's' : ''}: ${gameList}`);
  }

  // Add schedule details
  parts.push(`Schedule: ${getDetailedScheduleInfo(data)}`);

  // Add conditions if present
  if (data.conditions && Object.keys(data.conditions).length > 0) {
    const conditions = [];
    if (data.conditions.minViewers) {
      conditions.push(`Min viewers: ${data.conditions.minViewers}`);
    }
    if (data.conditions.minDuration) {
      conditions.push(`Min duration: ${data.conditions.minDuration}m`);
    }
    if (data.conditions.requireChat) {
      conditions.push('Requires chat');
    }
    if (conditions.length > 0) {
      parts.push(`Conditions: ${conditions.join(', ')}`);
    }
  }

  // Add restrictions if present
  if (data.restrictions && Object.keys(data.restrictions).length > 0) {
    const restrictions = [];
    if (data.restrictions.maxStoragePerChannel) {
      restrictions.push(`Max ${data.restrictions.maxStoragePerChannel}GB per channel`);
    }
    if (data.restrictions.maxTotalStorage) {
      restrictions.push(`Max ${data.restrictions.maxTotalStorage}GB total`);
    }
    if (restrictions.length > 0) {
      parts.push(`Restrictions: ${restrictions.join(', ')}`);
    }
  }

  // Add storage and retention info if specified
  if (data.storage_limit_gb) {
    parts.push(`Storage limit: ${data.storage_limit_gb}GB`);
  }
  if (data.retention_days) {
    parts.push(`Retention: ${data.retention_days} days${data.auto_delete ? ' (auto-delete)' : ''}`);
  }

  description = parts.join('\n');

  return { name, description };
}

function getScheduleInfo(data: Partial<CreateTaskRequest>): string {
  if (data.schedule_type === 'interval') {
    const hours = (parseInt(data.schedule_value || '3600') / 3600).toFixed(1);
    return `Every ${hours}h`;
  } else if (data.schedule_type === 'cron') {
    return 'Custom Schedule';
  } else {
    return 'Manual Execution';
  }
}

function getDetailedScheduleInfo(data: Partial<CreateTaskRequest>): string {
  if (data.schedule_type === 'interval') {
    const hours = (parseInt(data.schedule_value || '3600') / 3600).toFixed(1);
    return `Runs every ${hours} hour${hours === '1.0' ? '' : 's'}`;
  } else if (data.schedule_type === 'cron') {
    return `Custom schedule (${data.schedule_value})`;
  } else {
    return 'Manual execution only';
  }
}

export function validateTaskData(data: Partial<CreateTaskRequest>): string[] {
  const errors: string[] = [];

  // Check for required items based on task type
  if (data.task_type === 'channel' && (!data.channel_ids?.length)) {
    errors.push('At least one channel must be selected for channel tasks');
  } else if (data.task_type === 'game' && (!data.game_ids?.length)) {
    errors.push('At least one game must be selected for game tasks');
  } else if (data.task_type === 'combined' &&
             (!data.channel_ids?.length && !data.game_ids?.length)) {
    errors.push('At least one channel or game must be selected');
  }

  // Validate schedule settings
  if (data.schedule_type === 'interval') {
    const interval = parseInt(data.schedule_value || '0');
    if (interval < 300) { // 5 minutes minimum
      errors.push('Schedule interval must be at least 5 minutes');
    }
  } else if (data.schedule_type === 'cron') {
    if (!data.schedule_value?.trim()) {
      errors.push('Cron expression is required for cron schedule type');
    }
  }

  // Validate retention and storage settings
  if (data.retention_days != null) {
    if (data.retention_days < 1 || data.retention_days > 365) {
      errors.push('Retention days must be between 1 and 365');
    }
  }

  if (data.storage_limit_gb != null && data.storage_limit_gb < 0) {
    errors.push('Storage limit must be a positive number');
  }

  return errors;
}

export function getStorageUsagePercentage(used: number, limit: number): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, (used / limit) * 100);
}

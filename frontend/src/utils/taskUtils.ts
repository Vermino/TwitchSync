// Filepath: /frontend/src/utils/taskUtils.ts

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
    parts.push(`Channels: ${taskChannels.map(c => c.display_name).join(', ')}`);
  }

  // Add games to description
  if (taskGames.length > 0) {
    parts.push(`Games: ${taskGames.map(g => g.name).join(', ')}`);
  }

  // Add schedule details
  parts.push(`Schedule: ${scheduleInfo}`);

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

export function validateTaskData(data: Partial<CreateTaskRequest>): boolean {
  // Task must have at least one channel or game
  if ((!data.channel_ids || data.channel_ids.length === 0) &&
      (!data.game_ids || data.game_ids.length === 0)) {
    return false;
  }

  // Task must have a valid schedule type
  if (!['interval', 'cron', 'manual'].includes(data.schedule_type || '')) {
    return false;
  }

  // If interval schedule, must have positive value
  if (data.schedule_type === 'interval' &&
      (!data.schedule_value || parseInt(data.schedule_value) <= 0)) {
    return false;
  }

  // If storage limits set, must be positive
  if (data.storage_limit_gb && data.storage_limit_gb < 0) {
    return false;
  }

  // If retention days set, must be between 1-365
  if (data.retention_days && (data.retention_days < 1 || data.retention_days > 365)) {
    return false;
  }

  return true;
}

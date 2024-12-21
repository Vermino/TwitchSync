// Filepath: /frontend/src/utils/taskValidation.ts

import type { CreateTaskRequest, TaskType, TaskPriority } from '../types/task';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export const validateTaskData = (data: Partial<CreateTaskRequest>): ValidationResult => {
  const errors: string[] = [];

  // Validate required fields
  if (!data.name?.trim()) {
    errors.push('Task name is required');
  }

  if (!data.task_type) {
    errors.push('Task type is required');
  } else {
    // Validate channel and game IDs based on task type
    const hasChannels = data.channel_ids && data.channel_ids.length > 0;
    const hasGames = data.game_ids && data.game_ids.length > 0;

    switch (data.task_type) {
      case 'channel':
        if (!hasChannels) {
          errors.push('At least one channel must be selected for channel tasks');
        }
        break;
      case 'game':
        if (!hasGames) {
          errors.push('At least one game must be selected for game tasks');
        }
        break;
      case 'combined':
        if (!hasChannels || !hasGames) {
          errors.push('Both channels and games must be selected for combined tasks');
        }
        break;
    }
  }

  // Validate numeric fields
  if (data.storage_limit_gb !== undefined && data.storage_limit_gb < 0) {
    errors.push('Storage limit must be a positive number');
  }

  if (data.retention_days !== undefined && (data.retention_days < 1 || data.retention_days > 365)) {
    errors.push('Retention days must be between 1 and 365');
  }

  // Validate schedule
  if (!data.schedule_type) {
    errors.push('Schedule type is required');
  } else {
    switch (data.schedule_type) {
      case 'interval':
        const intervalValue = parseInt(data.schedule_value || '0');
        if (isNaN(intervalValue) || intervalValue < 300) { // 5 minutes minimum
          errors.push('Interval must be at least 300 seconds (5 minutes)');
        }
        break;
      case 'cron':
        if (!data.schedule_value?.trim()) {
          errors.push('Cron expression is required for cron schedule type');
        }
        // TODO: Add cron expression validation
        break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const createTaskRequest = (data: Partial<CreateTaskRequest>): CreateTaskRequest => {
  return {
    name: data.name || '',
    description: data.description || '',
    task_type: data.task_type || 'combined',
    channel_ids: data.channel_ids || [],
    game_ids: data.game_ids || [],
    schedule_type: data.schedule_type || 'interval',
    schedule_value: data.schedule_value || '3600',
    storage_limit_gb: data.storage_limit_gb || 0,
    retention_days: data.retention_days || 0,
    auto_delete: data.auto_delete || false,
    priority: data.priority || 'normal',
    conditions: data.conditions || {},
    restrictions: data.restrictions || {},
    is_active: true
  };
};

export const getDefaultTaskData = (): Partial<CreateTaskRequest> => ({
  name: '',
  description: '',
  task_type: 'combined',
  channel_ids: [],
  game_ids: [],
  schedule_type: 'interval',
  schedule_value: '3600',
  storage_limit_gb: 0,
  retention_days: 0,
  auto_delete: false,
  priority: 'normal',
  conditions: {},
  restrictions: {},
  is_active: true
});

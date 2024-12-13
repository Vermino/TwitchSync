// backend/src/routes/tasks/validation.ts

import { CreateTaskRequest, UpdateTaskRequest } from '../../types/database';

export const validateTaskId = (id: string): string | null => {
    const taskId = parseInt(id);
    if (isNaN(taskId) || taskId <= 0) {
        return 'Invalid task ID';
    }
    return null;
};

export const validateTaskData = (data: CreateTaskRequest): string | null => {
    // Name validation
    if (!data.name || data.name.trim().length === 0) {
        return 'Task name is required';
    }
    if (data.name.length > 100) {
        return 'Task name must be less than 100 characters';
    }

    // Description validation
    if (data.description && data.description.length > 1000) {
        return 'Description must be less than 1000 characters';
    }

    // Task type validation
    if (!['channel', 'game', 'combined'].includes(data.task_type)) {
        return 'Invalid task type';
    }

    // Channel and game IDs validation based on task type
    if (data.task_type === 'channel' && (!data.channel_ids || data.channel_ids.length === 0)) {
        return 'Channel IDs are required for channel tasks';
    }
    if (data.task_type === 'game' && (!data.game_ids || data.game_ids.length === 0)) {
        return 'Game IDs are required for game tasks';
    }
    if (data.task_type === 'combined') {
        if ((!data.channel_ids || data.channel_ids.length === 0) &&
            (!data.game_ids || data.game_ids.length === 0)) {
            return 'Either channel IDs or game IDs are required for combined tasks';
        }
    }

    // Schedule validation
    if (!['interval', 'cron', 'manual'].includes(data.schedule_type)) {
        return 'Invalid schedule type';
    }
    if (!data.schedule_value && data.schedule_type !== 'manual') {
        return 'Schedule value is required';
    }

    // Numeric validations
    if (data.storage_limit_gb && (isNaN(data.storage_limit_gb) || data.storage_limit_gb <= 0)) {
        return 'Storage limit must be a positive number';
    }
    if (data.retention_days && (isNaN(data.retention_days) || data.retention_days <= 0)) {
        return 'Retention days must be a positive number';
    }
    if (data.priority && (isNaN(data.priority) || data.priority < 1 || data.priority > 5)) {
        return 'Priority must be between 1 and 5';
    }

    return null;
};

export const validateUpdateTaskData = (data: UpdateTaskRequest): string | null => {
    // Name validation
    if (data.name !== undefined) {
        if (!data.name || data.name.trim().length === 0) {
            return 'Task name cannot be empty';
        }
        if (data.name.length > 100) {
            return 'Task name must be less than 100 characters';
        }
    }

    // Description validation
    if (data.description && data.description.length > 1000) {
        return 'Description must be less than 1000 characters';
    }

    // Schedule validation
    if (data.schedule_type && !['interval', 'cron', 'manual'].includes(data.schedule_type)) {
        return 'Invalid schedule type';
    }

    if (data.schedule_value && data.schedule_type === undefined) {
        return 'Schedule type is required when updating schedule value';
    }

    // Numeric validations
    if (data.storage_limit_gb && (isNaN(data.storage_limit_gb) || data.storage_limit_gb <= 0)) {
        return 'Storage limit must be a positive number';
    }
    if (data.retention_days && (isNaN(data.retention_days) || data.retention_days <= 0)) {
        return 'Retention days must be a positive number';
    }
    if (data.priority && (isNaN(data.priority) || data.priority < 1 || data.priority > 5)) {
        return 'Priority must be between 1 and 5';
    }

    return null;
};

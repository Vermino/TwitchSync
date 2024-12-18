// Filepath: backend/src/routes/tasks/validation.ts

import { Request, Response, NextFunction } from 'express';
import { CreateTaskRequest, UpdateTaskRequest } from '../../types/database';

export const validateIdParam = (req: Request, res: Response, next: NextFunction) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }
  next();
};

export const validateTaskData = (data: CreateTaskRequest): string | null => {
  // Name validation
  if (data.name && data.name.length > 100) {
    return 'Task name must be less than 100 characters';
  }

  // Description validation
  if (data.description && data.description.length > 1000) {
    return 'Description must be less than 1000 characters';
  }

  // Task type validation
  const validTaskTypes = ['channel', 'game', 'combined'] as const;
  if (data.task_type && !validTaskTypes.includes(data.task_type)) {
    return 'Invalid task type';
  }

  // Channel and game IDs validation
  if (!Array.isArray(data.channel_ids)) {
    return 'Channel IDs must be an array';
  }
  if (!Array.isArray(data.game_ids)) {
    return 'Game IDs must be an array';
  }

  if (data.channel_ids.length === 0 && data.game_ids.length === 0) {
    return 'At least one channel or game must be selected';
  }

  // Schedule validation
  const validScheduleTypes = ['interval', 'cron', 'manual'] as const;
  if (!validScheduleTypes.includes(data.schedule_type)) {
    return 'Invalid schedule type';
  }

  if (!data.schedule_value && data.schedule_type !== 'manual') {
    return 'Schedule value is required';
  }

  // Numeric validations
  if (data.storage_limit_gb && (isNaN(Number(data.storage_limit_gb)) || Number(data.storage_limit_gb) <= 0)) {
    return 'Storage limit must be a positive number';
  }

  if (data.retention_days && (isNaN(Number(data.retention_days)) || Number(data.retention_days) <= 0)) {
    return 'Retention days must be a positive number';
  }

  const validPriorities = ['low', 'medium', 'high'] as const;
  if (data.priority && !validPriorities.includes(data.priority)) {
    return 'Priority must be one of: low, medium, high';
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
  const validScheduleTypes = ['interval', 'cron', 'manual'] as const;
  if (data.schedule_type && !validScheduleTypes.includes(data.schedule_type)) {
    return 'Invalid schedule type';
  }

  if (data.schedule_value && data.schedule_type === undefined) {
    return 'Schedule type is required when updating schedule value';
  }

  // Numeric validations
  if (data.storage_limit_gb && (isNaN(Number(data.storage_limit_gb)) || Number(data.storage_limit_gb) <= 0)) {
    return 'Storage limit must be a positive number';
  }

  if (data.retention_days && (isNaN(Number(data.retention_days)) || Number(data.retention_days) <= 0)) {
    return 'Retention days must be a positive number';
  }

  const validPriorities = ['low', 'medium', 'high'] as const;
  if (data.priority && !validPriorities.includes(data.priority)) {
    return 'Priority must be one of: low, medium, high';
  }

  return null;
};

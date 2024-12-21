// Filepath: backend/src/routes/tasks/validation.ts

import { z } from 'zod';

// Enums
export const TaskTypeEnum = z.enum(['channel', 'game', 'combined']);
export const TaskScheduleTypeEnum = z.enum(['interval', 'cron', 'manual']);
export const TaskStatusEnum = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled', 'inactive']);
export const TaskPriorityEnum = z.enum(['low', 'normal', 'high', 'critical']);

// Sub-schemas
const TaskConditionsSchema = z.object({
  minFollowers: z.number().min(0).optional(),
  minViews: z.number().min(0).optional(),
  minDuration: z.number().min(0).optional(),
  languages: z.array(z.string()).optional(),
  requireChat: z.boolean().optional(),
}).optional();

const TaskRestrictionsSchema = z.object({
  maxVodsPerChannel: z.number().min(0).optional(),
  maxStoragePerChannel: z.number().min(0).optional(),
  maxTotalVods: z.number().min(0).optional(),
  maxTotalStorage: z.number().min(0).optional(),
}).optional();

// Main schemas
export const CreateTaskSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).optional(),
    task_type: TaskTypeEnum,
    channel_ids: z.array(z.number()).optional().default([]),
    game_ids: z.array(z.number()).optional().default([]),
    schedule_type: TaskScheduleTypeEnum,
    schedule_value: z.string().refine((val) => {
      if (val === 'manual') return true;
      if (val.match(/^\d+$/)) {
        const num = parseInt(val);
        return num >= 300; // Minimum 5 minutes
      }
      if (val.match(/^[0-9*/ -,]+$/)) { // Basic cron validation
        return true;
      }
      return false;
    }, {
      message: "Invalid schedule value format"
    }),
    storage_limit_gb: z.number().min(0).optional(),
    retention_days: z.number().min(1).max(365).optional(),
    auto_delete: z.boolean().optional(),
    is_active: z.boolean().optional(),
    priority: TaskPriorityEnum.optional().default('normal'),
    conditions: TaskConditionsSchema,
    restrictions: TaskRestrictionsSchema,
  }).refine((data) => {
    // Ensure at least one channel or game is selected based on task type
    if (data.task_type === 'channel' && (!data.channel_ids || data.channel_ids.length === 0)) {
      return false;
    }
    if (data.task_type === 'game' && (!data.game_ids || data.game_ids.length === 0)) {
      return false;
    }
    if (data.task_type === 'combined' &&
        (!data.channel_ids || data.channel_ids.length === 0) &&
        (!data.game_ids || data.game_ids.length === 0)) {
      return false;
    }
    return true;
  }, {
    message: "Task must include appropriate channels or games based on task type"
  })
});

export const UpdateTaskSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).optional(),
    channel_ids: z.array(z.number()).optional(),
    game_ids: z.array(z.number()).optional(),
    schedule_type: TaskScheduleTypeEnum.optional(),
    schedule_value: z.string().optional().refine((val) => {
      if (!val) return true; // Allow undefined/null for updates
      if (val === 'manual') return true;
      if (val.match(/^\d+$/)) {
        const num = parseInt(val);
        return num >= 300;
      }
      if (val.match(/^[0-9*/ -,]+$/)) {
        return true;
      }
      return false;
    }, {
      message: "Invalid schedule value format"
    }),
    storage_limit_gb: z.number().min(0).optional(),
    retention_days: z.number().min(1).max(365).optional(),
    auto_delete: z.boolean().optional(),
    is_active: z.boolean().optional(),
    priority: TaskPriorityEnum.optional(),
    conditions: TaskConditionsSchema,
    restrictions: TaskRestrictionsSchema,
    status: TaskStatusEnum.optional()
  })
});

export const BatchUpdateTasksSchema = z.object({
  body: z.object({
    task_ids: z.array(z.number()).min(1),
    updates: z.object({
      is_active: z.boolean().optional(),
      priority: TaskPriorityEnum.optional(),
      status: TaskStatusEnum.optional(),
      storage_limit_gb: z.number().min(0).optional(),
      retention_days: z.number().min(1).max(365).optional(),
      auto_delete: z.boolean().optional()
    })
  })
});

export const BatchDeleteTasksSchema = z.object({
  body: z.object({
    task_ids: z.array(z.number()).min(1)
  })
});

// Task progress and monitoring schemas
export const TaskProgressSchema = z.object({
  percentage: z.number().min(0).max(100),
  completed: z.number().min(0),
  total: z.number().min(0),
  current_item: z.object({
    type: z.enum(['channel', 'game']),
    name: z.string(),
    status: z.string()
  }).optional()
});

export const TaskStorageSchema = z.object({
  used: z.number().min(0),
  limit: z.number().min(0),
  remaining: z.number().min(0)
});

export const TaskVODStatsSchema = z.object({
  total_vods: z.number().min(0),
  total_size: z.number().min(0),
  average_duration: z.number().min(0),
  download_success_rate: z.number().min(0).max(100),
  vods_by_quality: z.record(z.string(), z.number()),
  vods_by_language: z.record(z.string(), z.number())
});

export const TaskDetailsSchema = z.object({
  id: z.number(),
  task_id: z.number(),
  progress: TaskProgressSchema,
  storage: TaskStorageSchema,
  vod_stats: TaskVODStatsSchema,
  created_at: z.date(),
  updated_at: z.date()
});

// Export types
export type Task = z.infer<typeof CreateTaskSchema>['body'];
export type UpdateTaskRequest = z.infer<typeof UpdateTaskSchema>['body'];
export type TaskDetails = z.infer<typeof TaskDetailsSchema>;
export type TaskProgress = z.infer<typeof TaskProgressSchema>;
export type TaskStorage = z.infer<typeof TaskStorageSchema>;
export type TaskVODStats = z.infer<typeof TaskVODStatsSchema>;

// Utility functions for validation
export function validateTaskCreation(data: unknown): Task {
  return CreateTaskSchema.parse({ body: data }).body;
}

export function validateTaskUpdate(data: unknown): UpdateTaskRequest {
  return UpdateTaskSchema.parse({ body: data }).body;
}

export function validateBatchUpdate(data: unknown) {
  return BatchUpdateTasksSchema.parse({ body: data }).body;
}

export function validateBatchDelete(data: unknown) {
  return BatchDeleteTasksSchema.parse({ body: data }).body;
}

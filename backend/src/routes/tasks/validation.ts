// Filepath: backend/src/routes/tasks/validation.ts

import { z } from 'zod';

// Enums that match database values
export const TaskTypeEnum = z.enum(['channel', 'game', 'combined']);
export const TaskScheduleTypeEnum = z.enum(['interval', 'cron', 'manual']);
export const TaskStatusEnum = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled', 'paused']);
export const TaskPriorityEnum = z.enum(['low', 'medium', 'high']);

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
  name: z.string().min(1).max(255),
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
    // Basic cron validation
    return val.match(/^[0-9*/ -,]+$/) !== null;
  }, {
    message: "Invalid schedule value format"
  }),
  storage_limit_gb: z.number().min(0).optional(),
  retention_days: z.number().min(1).max(365).optional(),
  auto_delete: z.boolean().optional(),
  is_active: z.boolean().optional(),
  priority: TaskPriorityEnum.optional().default('low'),
  conditions: TaskConditionsSchema,
  restrictions: TaskRestrictionsSchema,
});

export const UpdateTaskSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  channel_ids: z.array(z.number()).optional(),
  game_ids: z.array(z.number()).optional(),
  schedule_type: TaskScheduleTypeEnum.optional(),
  schedule_value: z.string().optional(),
  storage_limit_gb: z.number().min(0).optional(),
  retention_days: z.number().min(1).max(365).optional(),
  auto_delete: z.boolean().optional(),
  is_active: z.boolean().optional(),
  priority: TaskPriorityEnum.optional(),
  status: TaskStatusEnum.optional(),
  conditions: TaskConditionsSchema,
  restrictions: TaskRestrictionsSchema,
});

// Batch operation schemas
export const BatchUpdateTasksSchema = z.object({
  task_ids: z.array(z.number()).min(1),
  updates: z.object({
    is_active: z.boolean().optional(),
    priority: TaskPriorityEnum.optional(),
    status: TaskStatusEnum.optional(),
    storage_limit_gb: z.number().min(0).optional(),
    retention_days: z.number().min(1).max(365).optional(),
    auto_delete: z.boolean().optional()
  })
});

export const BatchDeleteTasksSchema = z.object({
  task_ids: z.array(z.number()).min(1)
});

// Base task schema for database operations
export const BaseTaskSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  name: z.string(),
  description: z.string().optional(),
  task_type: TaskTypeEnum,
  channel_ids: z.array(z.number()),
  game_ids: z.array(z.number()),
  schedule_type: TaskScheduleTypeEnum,
  schedule_value: z.string(),
  storage_limit_gb: z.number().optional(),
  retention_days: z.number().optional(),
  auto_delete: z.boolean(),
  is_active: z.boolean(),
  status: TaskStatusEnum,
  priority: TaskPriorityEnum,
  created_at: z.date(),
  updated_at: z.date(),
  monitoring_status: z.string().optional(),
  monitoring_enabled: z.boolean().optional()
});

// Type exports
export type Task = z.infer<typeof BaseTaskSchema>;
export type CreateTaskRequest = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskRequest = z.infer<typeof UpdateTaskSchema>;
export type BatchUpdateRequest = z.infer<typeof BatchUpdateTasksSchema>;
export type BatchDeleteRequest = z.infer<typeof BatchDeleteTasksSchema>;

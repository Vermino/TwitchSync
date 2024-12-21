// Filepath: backend/src/routes/tasks/validation.ts

import { z } from 'zod';
import { logger } from '../../utils/logger';

// Task priority and status enums
export const TaskPriority = z.enum(['low', 'normal', 'high', 'critical']);
export const TaskStatus = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export const TaskType = z.enum(['channel', 'game', 'combined']);
export const ScheduleType = z.enum(['interval', 'cron', 'manual']);

// Task base schema
const taskBaseSchema = {
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long').optional(),
  description: z.string().max(1000, 'Description is too long').optional(),
  task_type: TaskType,
  channel_ids: z.array(z.number()).default([]),
  game_ids: z.array(z.number()).default([]),
  schedule_type: ScheduleType,
  schedule_value: z.string().min(1, 'Schedule value is required'),
  storage_limit_gb: z.number().min(0).optional(),
  retention_days: z.number().min(1).max(365).optional(),
  auto_delete: z.boolean().default(false),
  priority: TaskPriority.default('normal'),
  is_active: z.boolean().default(true)
};

// Task execution request schema
export const ExecuteTaskSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\\d+$/, 'Invalid task ID')
  }),
  body: z.object({
    force: z.boolean().optional()
  }).optional()
});

// Search request schema
export const SearchTaskSchema = z.object({
  query: z.object({
    status: TaskStatus.optional(),
    type: TaskType.optional(),
    priority: TaskPriority.optional(),
    isActive: z.string().regex(/^(true|false)$/).transform(val => val === 'true').optional()
  }).optional()
});

// Create task request schema
export const CreateTaskSchema = z.object({
  body: z.object(taskBaseSchema)
}).refine(data => {
  const hasChannels = data.body.channel_ids.length > 0;
  const hasGames = data.body.game_ids.length > 0;

  if (data.body.task_type === 'channel' && !hasChannels) {
    return false;
  }
  if (data.body.task_type === 'game' && !hasGames) {
    return false;
  }
  if (data.body.task_type === 'combined' && (!hasChannels || !hasGames)) {
    return false;
  }
  return true;
}, {
  message: "Channel and game IDs must match the task type",
  path: ["task_type"]
});

// Update task request schema
export const UpdateTaskSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid task ID')
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(1000).optional(),
    schedule_type: ScheduleType.optional(),
    schedule_value: z.string().min(1).optional(),
    storage_limit_gb: z.number().min(0).optional(),
    retention_days: z.number().min(1).max(365).optional(),
    auto_delete: z.boolean().optional(),
    is_active: z.boolean().optional(),
    priority: TaskPriority.optional()
  })
});

// Delete task request schema
export const DeleteTaskSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid task ID')
  })
});

// Task stats schema
export const TaskStatsSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid task ID')
  }),
  query: z.object({
    timeframe: z.enum(['day', 'week', 'month', 'year', 'all']).optional(),
    include_history: z.string().regex(/^(true|false)$/).transform(val => val === 'true').optional()
  }).optional()
});

// Custom error class
export class TaskError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'TaskError';
  }
}

// Types exported from database
export interface Task {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  task_type: z.infer<typeof TaskType>;
  channel_ids: number[];
  game_ids: number[];
  schedule_type: z.infer<typeof ScheduleType>;
  schedule_value: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete: boolean;
  is_active: boolean;
  priority: z.infer<typeof TaskPriority>;
  status: z.infer<typeof TaskStatus>;
  last_run?: Date;
  next_run?: Date;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export interface TaskDetails {
  id: number;
  task_id: number;
  progress: {
    percentage: number;
    completed: number;
    total: number;
    current_item?: {
      type: 'channel' | 'game';
      name: string;
      status: string;
    };
  };
  storage: {
    used: number;
    limit: number;
    remaining: number;
  };
  vod_stats: {
    total_vods: number;
    total_size: number;
    average_duration: number;
    download_success_rate: number;
    vods_by_quality: Record<string, number>;
    vods_by_language: Record<string, number>;
  };
  created_at: Date;
  updated_at: Date;
}

// Type exports
export type SearchTaskRequest = z.infer<typeof SearchTaskSchema>;
export type CreateTaskRequest = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskRequest = z.infer<typeof UpdateTaskSchema>;
export type DeleteTaskRequest = z.infer<typeof DeleteTaskSchema>;
export type ExecuteTaskRequest = z.infer<typeof ExecuteTaskSchema>;

// Validation helper functions
export const validateTaskData = (data: Task): void => {
  try {
    const result = CreateTaskSchema.safeParse({ body: data });
    if (!result.success) {
      logger.error('Task validation failed:', {
        errors: result.error.errors,
        data
      });
      throw new TaskError('Invalid task data', 400, result.error.errors);
    }
  } catch (error) {
    if (error instanceof TaskError) {
      throw error;
    }
    logger.error('Unexpected error during task validation:', error);
    throw new TaskError('Failed to validate task data', 500);
  }
};

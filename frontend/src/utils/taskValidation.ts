// Filepath: /backend/src/routes/tasks/validation.ts

import { z } from 'zod';
import { logger } from '../../utils/logger';

// Task types and priorities
export const TaskPriority = z.enum(['low', 'normal', 'high', 'critical']);
export const TaskStatus = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export const TaskType = z.enum(['channel', 'game', 'combined']);
export const ScheduleType = z.enum(['interval', 'cron', 'manual']);

// Task base schema
const taskBaseSchema = {
  name: z.string().max(100, 'Name is too long').optional(),
  description: z.string().max(1000, 'Description is too long').optional(),
  task_type: TaskType,
  channel_ids: z.array(z.number()),
  game_ids: z.array(z.number()),
  schedule_type: ScheduleType,
  schedule_value: z.string().min(1, 'Schedule value is required'),
  storage_limit_gb: z.number().min(0).optional(),
  retention_days: z.number().min(1).max(365).optional(),
  auto_delete: z.boolean().default(false),
  priority: TaskPriority.default('normal'),
  is_active: z.boolean().default(true)
};

// Create task request schema
export const CreateTaskSchema = z.object({
  body: z.object(taskBaseSchema)
}).superRefine((data, ctx) => {
  const { body } = data;
  logger.debug('Validating task data:', body);

  // Validate task type specific requirements
  switch (body.task_type) {
    case 'channel':
      if (!body.channel_ids || body.channel_ids.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Channel task requires at least one channel',
          path: ['body', 'channel_ids']
        });
      }
      break;

    case 'game':
      if (!body.game_ids || body.game_ids.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Game task requires at least one game',
          path: ['body', 'game_ids']
        });
      }
      break;

    case 'combined':
      if (!body.channel_ids || !body.game_ids || body.channel_ids.length === 0 || body.game_ids.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Combined task requires both channels and games',
          path: ['body', 'task_type']
        });
      }
      break;
  }

  // Validate schedule value
  if (body.schedule_type === 'interval') {
    const interval = parseInt(body.schedule_value);
    if (isNaN(interval) || interval < 300) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Interval must be at least 300 seconds (5 minutes)',
        path: ['body', 'schedule_value']
      });
    }
  } else if (body.schedule_type === 'cron') {
    if (!body.schedule_value.match(/^[0-9,*\-/]+\s+[0-9,*\-/]+\s+[0-9,*\-/]+\s+[0-9,*\-/]+\s+[0-9,*\-/]+$/)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid cron expression',
        path: ['body', 'schedule_value']
      });
    }
  }
});

// Other schemas
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
    priority: TaskPriority.optional(),
    status: TaskStatus.optional()
  })
});

// Type definitions
export interface Task {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  task_type: 'channel' | 'game' | 'combined';
  channel_ids: number[];
  game_ids: number[];
  schedule_type: 'interval' | 'cron' | 'manual';
  schedule_value: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete: boolean;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'pending' | 'running' | 'failed' | 'cancelled';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_run?: string;
  progress?: TaskProgress;
}

export interface TaskProgress {
  percentage: number;
  status: string;
  message?: string;
}

export interface TaskDetails {
  task: Task;
  stats: {
    total_runs: number;
    successful_runs: number;
    failed_runs: number;
  };
}

// Helper function to generate task name
export function generateTaskName(data: any): string {
  const parts = [];

  if (data.channel_ids?.length) {
    parts.push(`${data.channel_ids.length} channel${data.channel_ids.length > 1 ? 's' : ''}`);
  }

  if (data.game_ids?.length) {
    parts.push(`${data.game_ids.length} game${data.game_ids.length > 1 ? 's' : ''}`);
  }

  const schedule = data.schedule_type === 'interval'
    ? `Every ${(parseInt(data.schedule_value || '3600') / 3600).toFixed(1)}h`
    : data.schedule_type === 'cron' ? 'Custom schedule' : 'Manual';

  const baseText = parts.length > 0
    ? `${parts.join(' + ')} Task`
    : 'Custom Task';

  return `${baseText} (${schedule})`;
}

export type CreateTaskRequest = z.infer<typeof CreateTaskSchema>['body'];
export type UpdateTaskRequest = z.infer<typeof UpdateTaskSchema>['body'];

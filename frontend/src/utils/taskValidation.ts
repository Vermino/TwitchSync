// Filepath: /backend/src/routes/tasks/validation.ts

import { z } from 'zod';

export const CreateTaskSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    task_type: z.enum(['channel', 'game', 'combined']),
    channel_ids: z.array(z.number()),
    game_ids: z.array(z.number()),
    schedule_type: z.enum(['interval', 'cron', 'manual']),
    schedule_value: z.string(),
    storage_limit_gb: z.number().min(0).optional(),
    retention_days: z.number().min(1).max(365).optional(),
    auto_delete: z.boolean().optional(),
    priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
    conditions: z.record(z.any()).optional(),
    restrictions: z.record(z.any()).optional()
  }).refine(data => {
    // Validate task type matches IDs
    switch (data.task_type) {
      case 'channel':
        if (data.channel_ids.length === 0) {
          return false;
        }
        if (data.game_ids.length > 0) {
          return false;
        }
        break;
      case 'game':
        if (data.game_ids.length === 0) {
          return false;
        }
        if (data.channel_ids.length > 0) {
          return false;
        }
        break;
      case 'combined':
        if (data.channel_ids.length === 0 && data.game_ids.length === 0) {
          return false;
        }
        break;
    }
    return true;
  }, {
    message: "Channel and game IDs must match the task type"
  }).refine(data => {
    // Validate schedule value
    if (data.schedule_type === 'interval') {
      const interval = parseInt(data.schedule_value);
      return interval >= 300; // Minimum 5 minutes
    }
    return true;
  }, {
    message: "Interval must be at least 5 minutes"
  })
});

export type Task = {
  id: number;
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
  status: 'pending' | 'running' | 'failed' | 'inactive';
  conditions?: Record<string, any>;
  restrictions?: Record<string, any>;
  created_at: string;
  updated_at: string;
  last_run?: string;
  user_id: number;
};

export type CreateTaskRequest = z.infer<typeof CreateTaskSchema>['body'];

export type UpdateTaskRequest = Partial<CreateTaskRequest>;

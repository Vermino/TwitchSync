// Filepath: frontend/src/types/task.ts

export interface Task {
  id: number;
  name: string;
  description: string | null;
  task_type: 'channel' | 'game' | 'combined';
  channel_ids: number[];
  game_ids: number[];
  schedule_type: 'interval' | 'cron' | 'manual';
  schedule_value: string;
  storage_limit_gb: number | null;
  retention_days: number | null;
  auto_delete: boolean;
  priority: number;
  is_active: boolean;
  status: 'pending' | 'active' | 'completed' | 'failed';
  last_run: string | null;
  next_run: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskProgress {
  percentage: number;
  completed: number;
  total: number;
  current_item?: {
    type: 'channel' | 'game';
    name: string;
    status: string;
  };
  queue: Array<{
    id: string;
    type: 'channel' | 'game';
    name: string;
    status: string;
    size?: number;
  }>;
}

export interface TaskStorage {
  used: number;
  limit: number;
  remaining: number;
  retention_policy: {
    enabled: boolean;
    days: number;
    auto_delete: boolean;
  };
}

export interface TaskDetails extends Task {
  progress: TaskProgress;
  storage: TaskStorage;
}

export interface CreateTaskRequest {
  name: string;
  description?: string;
  task_type: Task['task_type'];
  channel_ids: number[];
  game_ids: number[];
  schedule_type: Task['schedule_type'];
  schedule_value: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete?: boolean;
  priority?: number;
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  channel_ids?: number[];
  game_ids?: number[];
  schedule_type?: Task['schedule_type'];
  schedule_value?: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete?: boolean;
  priority?: number;
  is_active?: boolean;
}

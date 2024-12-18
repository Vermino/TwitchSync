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

export interface TaskFilters {
  minimum_followers?: number;
  minimum_views?: number;
  minimum_duration?: number;
  languages?: string[];
  quality_preference?: VideoQuality;
  content_tags?: string[];
  schedule_preference?: 'any' | 'live_only' | 'vod_only';
}

export interface CreateTaskRequest {
  name?: string;
  description?: string;
  channel_ids?: number[];
  game_ids?: number[];
  schedule_type: 'interval' | 'cron' | 'manual';
  schedule_value: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete?: boolean;
  priority?: 'low' | 'medium' | 'high';
  filters: TaskFilters;
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  channel_ids?: number[];
  game_ids?: number[];
  schedule_type?: 'interval' | 'cron' | 'manual';
  schedule_value?: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete?: boolean;
  priority?: 'low' | 'medium' | 'high';
  filters?: Partial<TaskFilters>;
}

export interface TaskDetails {
  id: number;
  task_id: number;
  progress: TaskProgress;
  storage: TaskStorage;
  vod_stats: TaskVODStats;
  created_at: Date;
  updated_at: Date;
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
}

export interface TaskStorage {
  used: number;
  limit: number;
  remaining: number;
}

export interface TaskVODStats {
  total_vods: number;
  total_size: number;
  average_duration: number;
  download_success_rate: number;
  vods_by_quality: Record<string, number>;
  vods_by_language: Record<string, number>;
}

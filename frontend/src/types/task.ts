// Filepath: frontend/src/types/task.ts

export type TaskType = 'channel' | 'game' | 'combined';
export type TaskScheduleType = 'interval' | 'cron' | 'manual';
export type TaskStatus = 'pending' | 'active' | 'completed' | 'failed';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskConditions {
  minFollowers?: number;
  minViews?: number;
  minDuration?: number;
  languages?: string[];
}

export interface TaskRestrictions {
  maxVodsPerChannel?: number;
  maxStoragePerChannel?: number;
  maxTotalVods?: number;
  maxTotalStorage?: number;
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

export interface Task {
  id: number;
  name: string;
  description: string | null;
  task_type: TaskType;
  channel_ids: number[];
  game_ids: number[];
  schedule_type: TaskScheduleType;
  schedule_value: string;
  storage_limit_gb: number | null;
  retention_days: number | null;
  auto_delete: boolean;
  is_active: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  conditions?: TaskConditions;
  restrictions?: TaskRestrictions;
  last_run: Date | null;
  next_run: Date | null;
  created_at: Date;
  updated_at: Date;
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

export interface CreateTaskRequest {
  name?: string;
  description?: string;
  channel_ids: number[];
  game_ids: number[];
  schedule_type: TaskScheduleType;
  schedule_value: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete?: boolean;
  priority?: TaskPriority;
  conditions?: TaskConditions;
  restrictions?: TaskRestrictions;
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  channel_ids?: number[];
  game_ids?: number[];
  schedule_type?: TaskScheduleType;
  schedule_value?: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete?: boolean;
  priority?: TaskPriority;
  conditions?: TaskConditions;
  restrictions?: TaskRestrictions;
  is_active?: boolean;
}

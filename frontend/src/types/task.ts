// Filepath: frontend/src/types/task.ts

export type TaskStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'failed'
  | 'running'
  | 'inactive'
  | 'cancelled'
  | 'paused'
  | 'scanning'
  | 'ready'
  | 'downloading';

export type TaskType = 'channel' | 'game' | 'combined';

export type TaskPriority = 'low' | 'medium' | 'high';

export type ScheduleType = 'interval' | 'cron' | 'manual';

export interface TaskProgress {
  percentage: number;
  status_message?: string;
  current_progress?: {
    completed: number;
    total: number;
    current_item?: {
      name: string;
      progress?: number;
    };
  };
}

export interface TaskConfig {
  channelId?: string;
  gameId?: string;
  quality: string;
  retention: number;
  filters?: {
    minViewers?: number;
    minDuration?: number;
    requireChat?: boolean;
  };
}

export interface Task {
  id: number;
  name: string;
  description?: string;
  task_type: TaskType;
  status: TaskStatus;
  channel_ids: number[];
  game_ids: number[];
  schedule_type: ScheduleType;
  schedule_value: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete: boolean;
  priority: TaskPriority;
  conditions: Record<string, any>;
  restrictions: Record<string, any>;
  progress?: TaskProgress;
  last_run?: string;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: number;
  twitch_id: string;
  username: string;
  display_name: string;
  profile_image_url: string | null;
  description: string | null;
  follower_count: number;
  is_active: boolean;
  is_live?: boolean;
  last_stream_date?: string;
  last_game_id?: string;
  last_game_name?: string;
  last_game_box_art?: string;
  most_played_game?: string;
  premieres?: any[];
  last_game_check?: string | null;
  current_game_id?: string | null;
  created_at: string;
}

export interface Game {
  id: number;
  twitch_game_id: string;
  name: string;
  box_art_url?: string | null;
  category?: string;
  tags?: string[];
  status?: string;
  is_active: boolean;
  last_check?: string | null;
  created_at: string;
}

export interface CreateTaskRequest {
  name: string;
  description?: string;
  task_type: TaskType;
  channel_ids: number[];
  game_ids: number[];
  schedule_type: ScheduleType;
  schedule_value: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete?: boolean;
  priority?: TaskPriority;
  conditions?: Record<string, any>;
  restrictions?: Record<string, any>;
}

export interface UpdateTaskRequest extends Partial<CreateTaskRequest> {
  status?: TaskStatus;
}

export interface TaskDetails extends Task {
  vods_count?: number;
  total_size_mb?: number;
  last_error?: string;
  performance_stats?: {
    average_speed: number;
    success_rate: number;
    total_downloads: number;
  };
}

export interface TaskStorage {
  used_gb: number;
  limit_gb?: number;
  files_count: number;
  oldest_file?: string;
  newest_file?: string;
}

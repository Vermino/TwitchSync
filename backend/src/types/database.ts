// Database table interfaces
export interface Channel {
  id: number;
  twitch_id: string;
  username: string;
  is_active: boolean;
  last_vod_check: Date | null;
  last_game_check: Date | null;
  current_game_id: string | null;
  created_at: Date;
}

export interface Game {
  id: number;
  game_id: string;
  twitch_game_id: string;
  name: string;
  is_active: boolean;
  last_checked: Date | null;
  created_at: Date;
}

export interface VOD {
  id: number;
  twitch_vod_id: string;
  channel_id: number;
  game_id: string | null;
  title: string;
  duration: string;
  view_count: number;
  created_at: Date;
  published_at: Date;
  type: string;
  url: string;
  thumbnail_url: string;
  processed_at: Date;
}

// Request types
export interface CreateChannelRequest {
  twitch_id: string;
  username: string;
}

export interface UpdateChannelRequest {
  is_active?: boolean;
  current_game_id?: string | null;
}

export interface CreateGameRequest {
  twitch_game_id: string;
  name: string;
}

export interface UpdateGameRequest {
  is_active?: boolean;
  name?: string;
}

export interface Channel {
    id: number;
    twitch_id: string;
    username: string;
    is_active: boolean;
    last_vod_check: Date | null;
    last_game_check: Date | null;
    current_game_id: string | null;
    created_at: Date;
}

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
  is_active: boolean;
  priority: number;
  last_run: Date | null;
  next_run: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type CreateTaskDTO = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'last_run' | 'next_run'>;

export interface TaskHistory {
    id: number;
    task_id: number;
    status: 'success' | 'failed' | 'cancelled';
    start_time: Date;
    end_time: Date | null;
    error_message: string | null;
    details: Record<string, unknown> | null;
    created_at: Date;
}

export interface Channel {
    id: number;
    twitch_id: string;
    username: string;
    display_name?: string;
    profile_image_url?: string;
    description?: string;
    follower_count?: number;
    is_active: boolean;
    last_vod_check: Date | null;
    last_game_check: Date | null;
    current_game_id: string | null;
    created_at: Date;
}

export interface Game {
    id: number;
    twitch_game_id: string;
    name: string;
    is_active: boolean;
    last_check: Date | null;
    created_at: Date;
}

export interface CreateTaskRequest {
    name: string;
    description?: string;
    task_type: 'channel' | 'game' | 'combined';
    channel_ids?: number[];
    game_ids?: number[];
    schedule_type: 'interval' | 'cron' | 'manual';
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
    schedule_type?: 'interval' | 'cron' | 'manual';
    schedule_value?: string;
    storage_limit_gb?: number;
    retention_days?: number;
    auto_delete?: boolean;
    is_active?: boolean;
    priority?: number;
}

export interface CreateChannelRequest {
    twitch_id: string;
    username: string;
    display_name?: string;
    profile_image_url?: string;
    description?: string;
    follower_count?: number;
}

export interface UpdateChannelRequest {
    is_active?: boolean;
    current_game_id?: string | null;
}

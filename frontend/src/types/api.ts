// Filepath: frontend/src/types/api.ts

// API Response Types
export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
  };
}

// Task Types
export type TaskStatus = 'pending' | 'active' | 'completed' | 'failed' | 'running' | 'inactive' | 'cancelled';
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

// Channel Types
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

export interface ChannelListResponse {
  channels: Channel[];
  totalChannels: number;
}

// Game Types
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

export interface CreateGameRequest {
  twitch_game_id: string;
  name: string;
  box_art_url?: string;
  category?: string;
  tags?: string[];
}

export interface UpdateGameRequest {
  is_active?: boolean;
  name?: string;
}

export interface GameListResponse {
  games: Game[];
  totalGames: number;
}

// Search Response Types
export interface TwitchChannelSearchResult {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
  description: string;
  broadcaster_type: string;
  view_count: number;
  follower_count?: number;
}

export interface TwitchGameSearchResult {
  id: string;
  name: string;
  box_art_url: string;
  igdb_id?: string;
}

// Dashboard Stats Types
export interface DashboardStats {
  channels: {
    total: number;
    active: number;
  };
  games: {
    total: number;
    active: number;
  };
  tasks: {
    active: number;
    pending: number;
    completed: number;
    failed: number;
  };
}

// Error Types
export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

// WebSocket Event Types
export interface WebSocketEvents {
  'task:update': {
    taskId: string;
    status: {
      status: TaskStatus;
      error?: string;
      progress?: number;
      message?: string;
    };
  };
  'channel:update': {
    channelId: string;
    changes: Partial<Channel>;
  };
  'game:update': {
    gameId: string;
    changes: Partial<Game>;
  };
}

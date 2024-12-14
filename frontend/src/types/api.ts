// frontend/src/types/api.ts

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

// Channel Types
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

// Game Types
export interface CreateGameRequest {
  twitch_game_id: string;
  name: string;
}

export interface UpdateGameRequest {
  is_active?: boolean;
  name?: string;
}

// Response Types
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

export interface ChannelListResponse {
  channels: {
    id: number;
    twitch_id: string;
    username: string;
    display_name: string;
    profile_image_url: string | null;
    description: string | null;
    follower_count: number;
    is_active: boolean;
    last_game_check: string | null;
    current_game_id: string | null;
    created_at: string;
  }[];
  totalChannels: number;
}

export interface GameListResponse {
  games: {
    id: number;
    twitch_game_id: string;
    name: string;
    is_active: boolean;
    last_check: string | null;
    created_at: string;
  }[];
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

// Error Types
export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

// Task Types
export interface TaskStatus {
  status: 'pending' | 'active' | 'completed' | 'failed';
  error?: string;
  progress?: number;
  message?: string;
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

export interface WebSocketEvents {
  'task:update': {
    taskId: string;
    status: TaskStatus;
  };
  'channel:update': {
    channelId: string;
    changes: Partial<ChannelListResponse['channels'][0]>;
  };
  'game:update': {
    gameId: string;
    changes: Partial<GameListResponse['games'][0]>;
  };
}

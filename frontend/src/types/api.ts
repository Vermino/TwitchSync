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

// Request Types
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
  channels: Channel[];
  totalChannels: number;
}

export interface GameListResponse {
  games: Game[];
  totalGames: number;
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
}

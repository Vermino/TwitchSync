// Base Models
export interface BaseModel {
  id: number;
  created_at: string;
  updated_at?: string;
}

// Game-related interfaces
export interface GameInfo {
  id: string;
  name: string;
  box_art_url: string;
}

export interface Game extends BaseModel {
  twitch_game_id: string;
  name: string;
  box_art_url: string;
  is_active: boolean;
  last_checked: string | null;
  metrics: {
    current_viewers: number;
    active_channels: number;
  };
}

export interface GamePremiereData {
  game: GameInfo;
  date: string;
  duration: number;
  viewers: number;
}

// Channel-related interfaces
export interface Channel extends BaseModel {
  twitch_id: string;
  username: string;
  display_name: string;
  profile_image_url: string | null;
  description: string | null;
  is_active: boolean;
  follower_count: number;
  last_game_check: string | null;
  current_game_id: string | null;

  // UI-specific fields from database joins
  last_stream_date: string | null;
  last_stream_game: GameInfo | null;
  last_stream_duration?: string;
  most_played_game: {
    id: string;
    name: string;
    box_art_url: string;
    hours: number;
  } | null;
  premieres: GamePremiereData[];

  metrics: {
    followers: number;
    average_viewers: number;
  };
}

// Search result interfaces
export interface TwitchChannelSearchResult {
  id: string;
  broadcaster_login: string;
  display_name: string;
  thumbnail_url: string;
  broadcaster_type: string;
  description?: string;
  tags?: string[];
  follower_count: number;
  current_game?: GameInfo;
}

export interface TwitchGameSearchResult {
  id: string;
  name: string;
  box_art_url: string;
  igdb_id?: string;
}

export interface SearchResults {
  channels?: TwitchChannelSearchResult[];
  games?: TwitchGameSearchResult[];
}

// Task-related interfaces
export interface Task extends BaseModel {
  type: 'CHANNEL_SYNC' | 'GAME_SYNC' | 'DISCOVERY';
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
  config: Record<string, any>;
  progress?: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

// Game change tracking
export interface GameChange extends BaseModel {
  channel_id: number;
  previous_game_id: string | null;
  new_game_id: string | null;
  changed_at: string;
}

// Discovery event interfaces
export interface DiscoveryEvent extends BaseModel {
  type: 'NEW_GAME' | 'RISING_CHANNEL' | 'SIMILAR_CONTENT';
  channel_id?: number;
  game_id?: string;
  confidence_score: number;
  metadata: Record<string, any>;
}

// User preferences and settings
export interface UserPreferences extends BaseModel {
  user_id: number;
  notification_settings: {
    new_games: boolean;
    rising_channels: boolean;
    similar_content: boolean;
  };
  discovery_settings: {
    min_confidence: number;
    auto_track: boolean;
    preferred_languages: string[];
  };
  schedule_settings: {
    active_hours: {
      start: string;
      end: string;
    };
    timezone: string;
  };
}

// Analytics interfaces
export interface ChannelMetrics {
  views: number;
  followers: number;
  average_viewers: number;
  peak_viewers: number;
  stream_count: number;
  hours_streamed: number;
}

export interface GameMetrics {
  current_viewers: number;
  peak_viewers: number;
  average_viewers: number;
  active_channels: number;
  total_streams: number;
  hours_streamed: number;
}

// WebSocket types
export interface WebSocketMessage<T = any> {
  type: string;
  payload: T;
  timestamp: string;
}

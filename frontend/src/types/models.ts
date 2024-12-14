// frontend/src/types/models.ts

// Base Models
export interface BaseModel {
  id: number;
  created_at: string;
}

// Channel Models
export interface Channel extends BaseModel {
  twitch_id: string;
  username: string;
  display_name: string;
  profile_image_url: string;
  description: string;
  is_active: boolean;
  last_game_check: string | null;
  current_game_id: string | null;
  metrics: {
    followers: number;
    average_viewers: number;
  };
}

// Game Models
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

// Task Models
export interface Task extends BaseModel {
  type: 'CHANNEL_SYNC' | 'GAME_SYNC' | 'DISCOVERY';
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
  config: Record<string, any>;
  progress?: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

// Game Change Models
export interface GameChange extends BaseModel {
  channel_id: number;
  previous_game_id: string | null;
  new_game_id: string | null;
  changed_at: string;
}

// Discovery Models
export interface DiscoveryEvent extends BaseModel {
  type: 'NEW_GAME' | 'RISING_CHANNEL' | 'SIMILAR_CONTENT';
  channel_id?: number;
  game_id?: string;
  confidence_score: number;
  metadata: Record<string, any>;
}

// Settings Models
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

// backend/src/types/discovery.ts

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tags: string[];
}

export interface PremiereEvent {
  id: string;
  type: 'CHANNEL_PREMIERE' | 'GAME_PREMIERE' | 'RISING_STAR';
  channel_id: number;
  game_id: number;
  start_time: Date;
  predicted_viewers: number;
  confidence_score: number;
  similar_channels: number;
  viewer_trend: 'rising' | 'stable' | 'falling';
  metadata: Record<string, any>;
  created_at: Date;
}

export interface DiscoveryPreferences {
  id: number;
  user_id: number;
  min_viewers: number;
  max_viewers: number;
  preferred_languages: string[];
  content_rating: 'all' | 'family' | 'mature';
  notify_only: boolean;
  schedule_match: boolean;
  confidence_threshold: number;
  created_at: Date;
  updated_at: Date;
}

export interface ChannelMetrics {
  id: number;
  channel_id: number;
  viewer_count: number;
  follower_count: number;
  viewer_growth_rate: number;
  engagement_rate: number;
  recorded_at: Date;
}

export interface PremiereTracking {
  id: number;
  user_id: number;
  premiere_id: number;
  task_id?: number;
  ignored: boolean;
  created_at: Date;
}

export interface DiscoveryRecommendation {
  id: string;
  type: 'CHANNEL' | 'GAME';
  score: number;
  reasons: Array<{
    type: 'GAME_OVERLAP' | 'VIEWER_OVERLAP' | 'SCHEDULE_MATCH';
    strength: number;
  }>;
  entity: {
    id: string;
    name: string;
    thumbnail: string;
    metrics: Record<string, number>;
  };
}

export interface ChannelCompatibility {
  score: number;
  factors: {
    viewer_range: boolean;
    language_match: boolean;
    schedule_match: boolean;
    game_overlap: number;
  };
}

// Request/Response types
export interface UpdatePreferencesRequest {
  min_viewers?: number;
  max_viewers?: number;
  preferred_languages?: string[];
  content_rating?: 'all' | 'family' | 'mature';
  notify_only?: boolean;
  schedule_match?: boolean;
  confidence_threshold?: number;
}

export interface TrackPremiereRequest {
  quality: 'best' | 'source' | '1080p' | '720p' | '480p';
  retention: number;
  notify: boolean;
}

export interface DiscoveryFeedResponse {
  preferences: DiscoveryPreferences;
  premieres: Array<PremiereEvent & {
    channel: {
      username: string;
      display_name: string;
      profile_image_url: string;
    };
    game: {
      name: string;
      box_art_url: string;
    };
  }>;
  risingChannels: Array<{
    id: number;
    username: string;
    display_name: string;
    profile_image_url: string;
    avg_viewers: number;
    growth_rate: number;
    current_game_name: string;
    game_image: string;
  }>;
}

export interface RecommendationsResponse {
  channels: Array<DiscoveryRecommendation & {
    channel: {
      username: string;
      display_name: string;
      profile_image_url: string;
      avg_viewers: number;
      follower_count: number;
    };
  }>;
  games: Array<DiscoveryRecommendation & {
    game: {
      name: string;
      box_art_url: string;
      genres: string[];
      active_channels: number;
    };
  }>;
}

// Filepath: backend/src/types/discovery.ts

export interface StreamFilters {
  limit?: number;
  languages?: string[];
  gameId?: string;
}

export interface BaseRecommendation {
  id: string;
  type: 'channel' | 'game';
  compatibility_score: number;
}

export interface ChannelRecommendation extends BaseRecommendation {
  type: 'channel';
  display_name: string;
  login: string;
  profile_image_url: string | null;
  description: string | null;
  viewer_count: number;
}

export interface GameRecommendation extends BaseRecommendation {
  type: 'game';
  game_id: string;  // Required field for game recommendations
  name: string;
  box_art_url: string;
}

export interface StreamFilters {
  languages?: string[];
  limit?: number;
  gameId?: string;
}

export interface UserPreferences {
  preferred_languages: string[];
  min_viewers: number;
  max_viewers: number;
  preferred_categories: string[];
  schedule_preference: string;
}

export interface FilterSettings {
  minViewers: number;
  maxViewers: number;
  preferredLanguages: string[];
  contentRating: 'all' | 'mature' | 'family';
  notifyOnly: boolean;
  scheduleMatch: boolean;
  confidenceThreshold: number;
}

export interface DiscoveryStats {
  upcomingPremieres: number;
  trackedPremieres: number;
  risingChannels: number;
  pendingArchives: number;
  todayDiscovered: number;
}

export interface Recommendation {
  id: string;
  type: 'channel' | 'game';
  compatibility_score: number;
  [key: string]: any;  // Allow additional properties based on type
}

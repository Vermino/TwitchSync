// Filepath: backend/src/types/discovery.ts

// Base Types
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

// Recommendation Types
export interface RecommendationBase {
  id: string;
  type: 'channel' | 'game';
  compatibility_score: number;
}

export type ChannelReasonType = 'GAME_OVERLAP' | 'VIEWER_OVERLAP' | 'SCHEDULE_MATCH';
export type GameReasonType = 'CHANNEL_OVERLAP' | 'VIEWER_OVERLAP' | 'GENRE_MATCH';

export interface RecommendationReason<T extends string = string> {
  type: T;
  strength: number;
}

export interface ChannelRecommendation {
  type: 'channel';
  id: string;
  display_name: string;
  login: string;
  profile_image_url: string;
  description: string;
  viewer_count: number;
  compatibility_score: number;
  recommendation_reasons: RecommendationReason<ChannelReasonType>[];
  shared_games_list?: { id: number; name: string }[];
  recent_vods?: { thumbnail_url: string; url: string; title: string; game_name: string }[];
  tags?: string[];
  current_game?: {
    id: string;
    name: string;
    box_art_url: string;
  };
}

export interface GameRecommendation extends RecommendationBase {
  type: 'game';
  game_id: string;
  name: string;
  box_art_url: string;
  recommendation_reasons: RecommendationReason<GameReasonType>[];
  category?: string;
  tags?: string[];
}

export type Recommendation = ChannelRecommendation | GameRecommendation;

// Premiere Types
export interface PremiereEvent {
  id: string;
  type: 'CHANNEL_PREMIERE' | 'GAME_PREMIERE' | 'RISING_STAR';
  channel_id: string;
  game_id: string;
  start_time: string;
  predicted_viewers: number;
  confidence_score: number;
  similar_channels: string[];
  viewer_trend: 'rising' | 'stable' | 'falling';
  metadata: {
    gameGenres?: string[];
    channelTags?: string[];
    isFirstPlay?: boolean;
    growthRate?: number;
    peakViewers?: number;
    detectionDate?: string;
  };
  created_at: string;
}

// Preferences & Settings Types
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
  tags?: string[];
  preferred_game_ids?: number[];
  created_at: Date;
  updated_at: Date;
}

export type UserPreferences = DiscoveryPreferences;

export interface FilterSettings {
  minViewers: number;
  maxViewers: number;
  preferredLanguages: string[];
  contentRating: 'all' | 'mature' | 'family';
  notifyOnly: boolean;
  scheduleMatch: boolean;
  confidenceThreshold: number;
}

export interface StreamFilters {
  languages?: string[];
  limit?: number;
  gameId?: string;
}

// Metrics & Stats Types
export interface ChannelMetrics {
  id: number;
  channel_id: number;
  viewer_count: number;
  follower_count: number;
  viewer_growth_rate: number;
  engagement_rate: number;
  recorded_at: Date;
}

export interface DiscoveryStats {
  upcomingPremieres: number;
  trackedPremieres: number;
  risingChannels: number;
  pendingArchives: number;
  todayDiscovered: number;
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

// Request Types
export interface UpdatePreferencesRequest {
  min_viewers?: number;
  max_viewers?: number;
  preferred_languages?: string[];
  content_rating?: 'all' | 'family' | 'mature';
  notify_only?: boolean;
  schedule_match?: boolean;
  confidence_threshold?: number;
  tags?: string[];
  preferred_game_ids?: number[];
}

export interface TrackPremiereRequest {
  quality: 'best' | 'source' | '1080p' | '720p' | '480p';
  retention: number;
  notify: boolean;
}

// Response Types
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

// Tracking Types
export interface PremiereTracking {
  id: number;
  user_id: number;
  premiere_id: number;
  task_id?: number;
  ignored: boolean;
  created_at: Date;
}

// Database Schema Types
export interface DatabaseSchema {
  discovery_preferences: DiscoveryPreferences;
  premiere_events: PremiereEvent;
  channel_metrics: ChannelMetrics;
  user_premiere_tracking: PremiereTracking;
  channel_metrics_archive: ChannelMetrics;
}

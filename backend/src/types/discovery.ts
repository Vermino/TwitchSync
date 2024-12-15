// backend/src/types/discovery.ts

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

export interface DiscoveryStats {
  upcoming_premieres: number;
  tracked_premieres: number;
  rising_channels: number;
  pending_archives: number;
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

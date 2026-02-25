// frontend/src/types/discovery.ts

// Base interfaces for metrics
export interface ViewerMetrics {
  activeChannels: number;
  totalViewers: number;
  averageViewers: number;
}

export interface ChannelMetrics {
  viewerGrowth: number;
  engagement: number;
  streamHours: number;
  followers: number;
  averageViewers: number;
}

export interface GameMetrics {
  activeChannels: number;
  totalViewers: number;
  averageViewers: number;
}

// Discovery preferences and settings
export interface DiscoveryPreferences {
  minViewers: number;
  maxViewers: number;
  preferredLanguages: string[];
  contentRating: 'all' | 'family' | 'mature';
  notifyOnly: boolean;
  confidenceThreshold: number;
}

export interface FilterSettings {
  minViewers: number;
  maxViewers: number;
  preferredLanguages: string[];
  contentRating: string;
  notifyOnly: boolean;
  confidenceThreshold: number;
}

// Channel and Game interfaces
export interface Channel {
  id: string;
  name: string;
  avatar: string;
  followers: number;
  averageViewers: number;
  currentGame: string;
  language: string;
}

export interface Game {
  id: string;
  name: string;
  boxArt: string;
  genres: string[];
  releaseDate?: string;
}

// Recommendation types and interfaces
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

export interface GameRecommendation {
  type: 'game';
  id: string;
  game_id: string;
  name: string;
  box_art_url: string;
  compatibility_score: number;
  recommendation_reasons: RecommendationReason<GameReasonType>[];
  tags?: string[];
}

export type Recommendation = ChannelRecommendation | GameRecommendation;

// trending category interfaces

export interface TrendingCategory {
  id: string;
  name: string;
  boxArt: string;
  metrics: {
    viewers: number;
    channels: number;
    growth: number;
  };
  tags: string[];
}

// Stats interface
export interface DiscoveryStats {
  pendingArchives: number;
  todayDiscovered: number;
}

// API Response types
export interface DiscoveryFeedResponse {
  preferences: DiscoveryPreferences;
  recommendations: {
    channels: ChannelRecommendation[];
    games: GameRecommendation[];
  };
  trending: TrendingCategory[];
  stats: DiscoveryStats;
}

export interface UpdatePreferencesResponse {
  preferences: DiscoveryPreferences;
}

export interface RecommendationCardProps {
  item: Recommendation;
  type: 'channel' | 'game';
  onAction: (id: string) => Promise<void>;
  onIgnore?: (id: string) => Promise<void>;
}

export interface FilterPanelProps {
  settings: FilterSettings;
  onChange: (settings: FilterSettings) => void;
}

export interface StatsCardProps {
  stats: DiscoveryStats;
}

export interface TrendingCategoryCardProps {
  category: TrendingCategory;
  onSelect: (id: string) => void;
}

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

// Premiere and Event interfaces
export interface StreamPremiereEvent {
  id: string;
  type: 'CHANNEL_PREMIERE' | 'GAME_PREMIERE' | 'RISING_STAR';
  channel: {
    id: string;
    name: string;
    avatar: string;
    followerCount: number;
    averageViewers: number;
  };
  game: {
    id: string;
    name: string;
    boxArt: string;
    releaseDate?: string;
    genres: string[];
  };
  startTime: string;
  metrics: {
    predictedViewers: number;
    similarChannels: number;
    viewerTrend: 'rising' | 'stable' | 'falling';
    confidence: number;
  };
  tags: string[];
}

// Discovery preferences and settings
export interface DiscoveryPreferences {
  minViewers: number;
  maxViewers: number;
  preferredLanguages: string[];
  contentRating: 'all' | 'family' | 'mature';
  notifyOnly: boolean;
  scheduleMatch: boolean;
  confidenceThreshold: number;
}

export interface FilterSettings {
  minViewers: number;
  maxViewers: number;
  preferredLanguages: string[];
  contentRating: string;
  notifyOnly: boolean;
  scheduleMatch: boolean;
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

interface BaseRecommendation<T extends string, M> {
  id: string;
  score: number;
  reasons: Array<RecommendationReason<T>>;
  metrics: M;
}

export interface ChannelRecommendation extends BaseRecommendation<ChannelReasonType, ChannelMetrics> {
  type: 'channel';
  channel: Channel;
}

export interface GameRecommendation extends BaseRecommendation<GameReasonType, GameMetrics> {
  type: 'game';
  game: Game;
}

export type Recommendation = ChannelRecommendation | GameRecommendation;

// Rising channel and trending category interfaces
export interface RisingChannel {
  id: string | number;
  display_name: string;
  username: string;
  profile_image_url?: string;
  current_game_name?: string;
  game_image?: string;
  avg_viewers?: number;
  growth_rate?: number;
  tags?: string[];
  metrics?: {
    followers?: number;
    averageViewers?: number;
    peakViewers?: number;
  };
}

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
  upcomingPremieres: number;
  trackedPremieres: number;
  risingChannels: number;
  pendingArchives: number;
  todayDiscovered: number;
}

// API Response types
export interface DiscoveryFeedResponse {
  preferences: DiscoveryPreferences;
  premieres: StreamPremiereEvent[];
  risingChannels: RisingChannel[];
  recommendations: {
    channels: ChannelRecommendation[];
    games: GameRecommendation[];
  };
  trending: TrendingCategory[];
  stats: DiscoveryStats;
}

export interface TrackPremiereResponse {
  success: boolean;
  taskId?: string;
  message: string;
}

export interface UpdatePreferencesResponse {
  preferences: DiscoveryPreferences;
}

// Component prop types
export interface PremiereCardProps {
  premiere: StreamPremiereEvent;
  onTrack: (id: string) => Promise<void>;
  onIgnore: (id: string) => Promise<void>;
}

export interface RisingChannelCardProps {
  channel: RisingChannel;
  onTrack?: (channelId: string) => void;
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

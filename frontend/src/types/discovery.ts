// frontend/src/types/discovery.ts

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

export interface DiscoveryPreferences {
  minViewers: number;
  maxViewers: number;
  preferredLanguages: string[];
  contentRating: 'all' | 'family' | 'mature';
  notifyOnly: boolean;
  scheduleMatch: boolean;
  confidenceThreshold: number;
}

export interface ChannelRecommendation {
  id: string;
  channel: {
    name: string;
    avatar: string;
    followers: number;
    averageViewers: number;
    currentGame: string;
    language: string;
  };
  score: number;
  reasons: Array<{
    type: 'GAME_OVERLAP' | 'VIEWER_OVERLAP' | 'SCHEDULE_MATCH';
    strength: number;
  }>;
  metrics: {
    viewerGrowth: number;
    engagement: number;
    streamHours: number;
  };
}

export interface GameRecommendation {
  id: string;
  game: {
    name: string;
    boxArt: string;
    genres: string[];
    releaseDate?: string;
  };
  score: number;
  reasons: Array<{
    type: 'CHANNEL_OVERLAP' | 'VIEWER_OVERLAP' | 'GENRE_MATCH';
    strength: number;
  }>;
  metrics: {
    activeChannels: number;
    totalViewers: number;
    averageViewers: number;
  };
}

export interface RisingChannel {
  id: string;
  name: string;
  avatar: string;
  currentGame: string;
  gameImage: string;
  metrics: {
    averageViewers: number;
    growthRate: number;
    peakViewers: number;
    followers: number;
  };
  tags: string[];
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

export interface DiscoveryStats {
  upcomingPremieres: number;
  trackedPremieres: number;
  risingChannels: number;
  pendingArchives: number;
  todayDiscovered: number;
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
  onTrack: (id: string) => Promise<void>;
}

export interface RecommendationCardProps {
  item: ChannelRecommendation | GameRecommendation;
  type: 'channel' | 'game';
  onAction: (id: string, type: string) => Promise<void>;
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

// Filepath: backend/src/services/twitch/types.ts

import { TwitchAPIClient } from './api-client';

export interface TwitchAPIResponse<T> {
  data: T[];
  pagination?: {
    cursor?: string;
  };
  total?: number;
}

export interface TwitchStreamInfo {
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

export interface TwitchScheduleSegment {
  id: string;
  start_time: string;
  end_time: string;
  title: string;
  canceled_until?: string;
  category?: {
    id: string;
    name: string;
  };
}

export interface TwitchScheduleResponse {
  segments: TwitchScheduleSegment[];
  broadcaster_id?: string;
  broadcaster_name?: string;
  broadcaster_login?: string;
  vacation?: {
    start_time: string;
    end_time: string;
  } | null;
}

export interface TwitchVOD {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: 'upload' | 'archive' | 'highlight';
  duration: string;
  muted_segments: null | any[];
  game_id?: string; // Added for filtering support
}

export interface TwitchGame {
  id: string;
  name: string;
  box_art_url: string;
  igdb_id?: string;
  genres?: string[];
}

export interface TwitchChannel {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
  offline_image_url: string;
  description: string;
  view_count: number;
  broadcaster_type: string;
  follower_count?: number;
}

export interface StreamFilters {
  limit?: number;
  languages?: string[];
  gameId?: string;
}

export interface PlaylistData {
  qualities: Record<string, {
    segments: Array<{
      url: string;
      duration: number;
    }>;
  }>;
  duration: number;
}

export interface EnrichedGame extends TwitchGame {
  category: string;
  tags: string[];
  last_checked: string;
  status: 'active' | 'inactive';
  is_active: boolean;
}

export interface EnrichedChannel extends TwitchChannel {
  twitch_id: string;
  username: string;
  current_game?: {
    id: string;
    name: string;
    box_art_url: string;
  };
  is_live: boolean;
  tags: string[];
}

export interface ITwitchService {
  readonly apiClient: TwitchAPIClient;
  searchChannels(query: string): Promise<EnrichedChannel[]>;
  getChannelFollowers(channelId: string): Promise<number>;
  getChannelVODs(userId: string): Promise<TwitchVOD[]>;
  getVODInfo(vodId: string): Promise<TwitchVOD | null>;
  getVODPlaylist(vodId: string, quality?: string): Promise<PlaylistData | null>;
  getGameById(gameId: string): Promise<EnrichedGame | null>;
  searchGames(query: string): Promise<EnrichedGame[]>;
  getCurrentGame(channelId: string): Promise<EnrichedGame | null>;
  getTopStreams(filters?: StreamFilters): Promise<any[]>;
  getChannelInfo(username: string): Promise<EnrichedChannel | null>;
}

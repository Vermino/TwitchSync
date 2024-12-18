// Filepath: backend/src/services/twitch/api.ts

import axios, { AxiosResponse } from 'axios';
import { logger } from '../../utils/logger';
import { StreamFilters } from '../../types/discovery';
import {
  ChapterInfo,
  VODInfo,
  VODPlaylist,
  VODMarker,
  ChatMessage,
  VODQuality,
  VODSegment
} from '../../types/twitch';

interface TwitchAPIResponse<T> {
  data: T[];
  pagination?: {
    cursor?: string;
  };
}

interface TwitchPlaylistResponse {
  data: {
    qualities: Array<{
      name: string;
      segments: Array<{
        url: string;
        duration: number;
      }>;
    }>;
  };
}

interface TwitchChannel {
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

interface TwitchGame {
  id: string;
  name: string;
  box_art_url: string;
  igdb_id?: string;
  genres?: string[];
}

// Extended interface for our enriched game data
interface EnrichedTwitchGame extends TwitchGame {
  category?: string;
  tags?: string[];
  last_checked?: string;
  status?: string;
  is_active?: boolean;
  genres?: string[];
}

export class TwitchAPIService {
  private static instance: TwitchAPIService;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiration: number = 0;

  private constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID || '';
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET || '';

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Twitch API credentials not configured');
    }
  }

  public static getInstance(): TwitchAPIService {
    if (!TwitchAPIService.instance) {
      TwitchAPIService.instance = new TwitchAPIService();
    }
    return TwitchAPIService.instance;
  }

  private async refreshAccessToken(): Promise<string> {
    try {
      const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials'
        }
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiration = Date.now() + (response.data.expires_in * 1000) - 300000; // 5 minutes buffer

      if (!this.accessToken) {
        throw new Error('Failed to obtain access token from Twitch');
      }

      return this.accessToken;
    } catch (error) {
      logger.error('Failed to refresh Twitch access token:', error);
      throw new Error('Failed to obtain Twitch access token');
    }
  }

  private async getAccessToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiration) {
      return this.refreshAccessToken();
    }
    return this.accessToken;
  }

  private async makeRequest<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<TwitchAPIResponse<T>> {
    try {
      const token = await this.getAccessToken();
      const response = await axios.get<TwitchAPIResponse<T>>(`https://api.twitch.tv/helix${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id': this.clientId
        },
        params
      });
      return response.data;
    } catch (error) {
      logger.error(`Twitch API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  private formatBoxArtUrl(url: string | null | undefined): string {
    if (!url) {
      return `/api/placeholder/285/380`;
    }

    // Convert any sized URL to base IGDB.jpg format
    if (url.includes('-')) {
      return url.replace(/-\d+x\d+\.jpg$/, '-IGDB.jpg');
    }

    // Handle template URLs
    if (url.includes('{width}') && url.includes('{height}')) {
      return url.replace('{width}x{height}', 'IGDB');
    }

    return url;
  }

  private async getChannelFollowers(channelId: string): Promise<number> {
    try {
      const response = await this.makeRequest<{ total: number }>('/users/follows', {
        to_id: channelId
      });
      return response.data[0]?.total || 0;
    } catch (error) {
      logger.error(`Failed to get follower count for channel ${channelId}:`, error);
      return 0;
    }
  }

  async searchChannels(query: string): Promise<TwitchChannel[]> {
    try {
      const response = await this.makeRequest<TwitchChannel>('/search/channels', {
        query,
        first: '20'
      });

      // Get follower counts for all channels in parallel
      const enrichedChannels = await Promise.all(
        response.data.map(async (channel) => {
          const followerCount = await this.getChannelFollowers(channel.id);
          return {
            ...channel,
            follower_count: followerCount
          };
        })
      );

      // Sort channels by follower count in descending order
      return enrichedChannels.sort((a, b) => {
        return (b.follower_count || 0) - (a.follower_count || 0);
      });
    } catch (error) {
      logger.error('Error searching channels:', error);
      throw error;
    }
  }

  async searchGames(query: string): Promise<TwitchGame[]> {
    try {
      const searchResponse = await this.makeRequest<TwitchGame>('/search/categories', {
        query,
        first: '20'
      });

      const enrichedGames = await Promise.all(
        searchResponse.data.map(async (game) => {
          try {
            const gameResponse = await this.makeRequest<TwitchGame>('/games', {
              id: game.id
            });

            const gameData = gameResponse.data[0] || game;

            // Store original IGDB format URL
            const baseBoxArtUrl = this.formatBoxArtUrl(gameData.box_art_url || game.box_art_url);

            return {
              ...gameData,
              box_art_url: baseBoxArtUrl,
              category: gameData.name.split(' ')[0].toLowerCase(),
              tags: [],
              last_checked: new Date().toISOString(),
              status: 'active',
              is_active: true
            };
          } catch (error) {
            logger.error(`Failed to get details for game ${game.name}:`, error);
            return {
              ...game,
              box_art_url: this.formatBoxArtUrl(game.box_art_url),
              category: game.name.split(' ')[0].toLowerCase(),
              tags: [],
              last_checked: new Date().toISOString(),
              status: 'active',
              is_active: true
            };
          }
        })
      );

      return enrichedGames;
    } catch (error) {
      logger.error('Error searching games:', error);
      throw error;
    }
  }

  async getTopStreams(filters: StreamFilters): Promise<any[]> {
    const params: Record<string, string | number> = {
      first: filters.limit?.toString() || '100'
    };

    if (filters.languages?.length) {
      params.language = filters.languages.join(',');
    }

    if (filters.gameId) {
      params.game_id = filters.gameId;
    }

    const response = await this.makeRequest<any>('/streams', params);
    return response.data;
  }

  async getCurrentGame(channelId: string): Promise<EnrichedTwitchGame | null> {
    try {
      const response = await this.makeRequest<any>('/streams', { user_id: channelId });
      if (response.data.length === 0) {
        return null;
      }

      const stream = response.data[0];
      const gameResponse = await this.makeRequest<TwitchGame>('/games', { id: stream.game_id });

      if (gameResponse.data.length === 0) {
        return null;
      }

      const gameData = gameResponse.data[0];
      const enrichedGame: EnrichedTwitchGame = {
        ...gameData,
        box_art_url: this.formatBoxArtUrl(gameData.box_art_url),
        category: gameData.name.split(' ')[0].toLowerCase(),
        tags: [],
        last_checked: new Date().toISOString(),
        status: 'active',
        is_active: true
      };

      return enrichedGame;
    } catch (error) {
      logger.error('Failed to get current game:', error);
      return null;
    }
  }

  async getGameById(gameId: string): Promise<EnrichedTwitchGame | null> {
    try {
      const response = await this.makeRequest<TwitchGame>('/games', { id: gameId });

      if (response.data.length === 0) {
        return null;
      }

      const gameData = response.data[0];
      const enrichedGame: EnrichedTwitchGame = {
        ...gameData,
        box_art_url: this.formatBoxArtUrl(gameData.box_art_url),
        category: gameData.name.split(' ')[0].toLowerCase(),
        tags: [],
        last_checked: new Date().toISOString(),
        status: 'active',
        is_active: true
      };

      return enrichedGame;
    } catch (error) {
      logger.error(`Failed to get game by ID ${gameId}:`, error);
      return null;
    }
  }

  async getVODInfo(vodId: string): Promise<any> {
    try {
      const response = await this.makeRequest<any>(`/videos/${vodId}`);
      return response.data[0];
    } catch (error) {
      logger.error(`Failed to get VOD info for ${vodId}:`, error);
      throw error;
    }
  }

  async getVODPlaylist(vodId: string, quality?: string): Promise<{
    qualities: Record<string, { segments: { url: string; duration: number; }[] }>;
    duration: number;
  } | null> {
    try {
      const response = await this.makeRequest<TwitchPlaylistResponse>(`/videos/${vodId}/playlist`);

      // Transform the raw response into the expected format
      const playlistData = {
        qualities: {} as Record<string, { segments: { url: string; duration: number; }[] }>,
        duration: 0
      };

      if (response.data && Array.isArray(response.data)) {
        // Handle the case where response.data is an array
        const playlistResponse = response.data[0] as any;

        if (playlistResponse && Array.isArray(playlistResponse.qualities)) {
          let totalDuration = 0;

          // Transform qualities data
          playlistResponse.qualities.forEach((quality: any) => {
            if (quality.name && Array.isArray(quality.segments)) {
              playlistData.qualities[quality.name] = {
                segments: quality.segments.map((segment: any) => ({
                  url: segment.url || '',
                  duration: parseFloat(segment.duration) || 0
                }))
              };

              // Update total duration based on the first quality's segments
              if (totalDuration === 0) {
                totalDuration = playlistData.qualities[quality.name].segments.reduce(
                  (sum: number, segment: { duration: number }) => sum + segment.duration,
                  0
                );
              }
            }
          });

          playlistData.duration = totalDuration;

          // If specific quality is requested, filter to only that quality
          if (quality && playlistData.qualities[quality]) {
            return {
              qualities: { [quality]: playlistData.qualities[quality] },
              duration: playlistData.duration
            };
          }

          return playlistData;
        }
      }

      logger.error(`Invalid playlist data format for VOD ${vodId}`);
      return null;
    } catch (error) {
      logger.error(`Failed to get VOD playlist for ${vodId}:`, error);
      return null;
    }
  }

  async getVODChat(vodId: string): Promise<any[]> {
    try {
      const response = await this.makeRequest<any>(`/videos/${vodId}/chat`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get VOD chat for ${vodId}:`, error);
      throw error;
    }
  }

  async getVODMarkers(vodId: string): Promise<any[]> {
    try {
      const response = await this.makeRequest<any>(`/videos/${vodId}/markers`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get VOD markers for ${vodId}:`, error);
      throw error;
    }
  }

  async getVODChapters(vodId: string): Promise<ChapterInfo[]> {
    try {
      const response = await this.makeRequest<any>(`/videos/${vodId}/chapters`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get VOD chapters for ${vodId}:`, error);
      throw error;
    }
  }

}

export const twitchAPI = TwitchAPIService.getInstance();

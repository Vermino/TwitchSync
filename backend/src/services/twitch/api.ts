// Filepath: backend/src/services/twitch/api.ts

import axios, { AxiosResponse } from 'axios';
import { logger } from '../../utils/logger';
import { StreamFilters } from '../../types/discovery';

interface TwitchAPIResponse<T> {
  data: T[];
  pagination?: {
    cursor?: string;
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
  genres: any;
  id: string;
  name: string;
  box_art_url: string;
  igdb_id?: string;
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

  async searchChannels(query: string): Promise<TwitchChannel[]> {
    try {
      const response = await this.makeRequest<TwitchChannel>('/search/channels', {
        query,
        first: '20'
      });

      logger.info('Raw Twitch API response:', response);

      // Get follower counts for each channel
      const enrichedChannels = await Promise.all(
        response.data.map(async (channel) => {
          try {
            const followersResponse = await this.makeRequest<{ total: number }>('/users/follows', {
              to_id: channel.id
            });

            return {
              ...channel,
              follower_count: followersResponse.data.length
            };
          } catch (error) {
            logger.error(`Failed to get follower count for channel ${channel.display_name}:`, error);
            return {
              ...channel,
              follower_count: 0
            };
          }
        })
      );

      return enrichedChannels;
    } catch (error) {
      logger.error('Error searching channels:', error);
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

  async getCurrentGame(channelId: string): Promise<TwitchGame | null> {
    try {
      const response = await this.makeRequest<any>('/streams', { user_id: channelId });
      if (response.data.length === 0) {
        return null;
      }

      const stream = response.data[0];
      const gameResponse = await this.makeRequest<TwitchGame>('/games', { id: stream.game_id });
      return gameResponse.data[0] || null;
    } catch (error) {
      logger.error('Failed to get current game:', error);
      return null;
    }
  }
}

export const twitchAPI = TwitchAPIService.getInstance();

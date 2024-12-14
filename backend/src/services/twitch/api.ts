// backend/src/services/twitch/api.ts

import axios, { AxiosResponse } from 'axios';
import { logger } from '../../utils/logger';

interface TwitchChannel {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
  offline_image_url: string;
  description: string;
  view_count: number;
  broadcaster_type: string;
}

interface TwitchResponse<T> {
  data: T[];
  pagination?: {
    cursor?: string;
  };
}

export class TwitchAPI {
  private clientId: string;
  private clientSecret: string;
  private credentials: {
    accessToken: string;
    expiresIn: number;
    obtainedAt: number;
  } | null = null;
  private static instance: TwitchAPI;

  private constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID || '';
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET || '';

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Twitch credentials not properly configured');
    }
  }

  public static getInstance(): TwitchAPI {
    if (!TwitchAPI.instance) {
      TwitchAPI.instance = new TwitchAPI();
    }
    return TwitchAPI.instance;
  }

  private async getAccessToken(): Promise<string> {
    try {
      if (
        this.credentials &&
        Date.now() - this.credentials.obtainedAt < (this.credentials.expiresIn - 300) * 1000
      ) {
        return this.credentials.accessToken;
      }

      const response = await axios.post<{ access_token: string; expires_in: number }>(
        `https://id.twitch.tv/oauth2/token` +
        `?client_id=${this.clientId}` +
        `&client_secret=${this.clientSecret}` +
        `&grant_type=client_credentials`
      );

      this.credentials = {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        obtainedAt: Date.now(),
      };

      return this.credentials.accessToken;
    } catch (error) {
      logger.error('Failed to obtain Twitch access token:', error);
      throw new Error('Failed to obtain Twitch access token');
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<AxiosResponse<TwitchResponse<T>>> {
    try {
      const accessToken = await this.getAccessToken();

      return axios.get<TwitchResponse<T>>(`https://api.twitch.tv/helix${endpoint}`, {
        headers: {
          'Client-ID': this.clientId,
          'Authorization': `Bearer ${accessToken}`,
        },
        params,
      });
    } catch (error) {
      logger.error(`Failed to make Twitch API request to ${endpoint}:`, error);
      throw error;
    }
  }

  async searchChannels(query: string): Promise<TwitchChannel[]> {
    try {
      const searchResponse = await this.makeRequest<TwitchChannel>('/search/channels', {
        query,
        first: '10'
      });

      logger.info('Raw Twitch API response:', searchResponse.data);

      const broadcasterIds = searchResponse.data.data.map(channel => channel.id);

      const followerCounts = await Promise.all(
        broadcasterIds.map(async (id) => {
          const response = await this.makeRequest<{ total: number }>('/users/follows', {
            to_id: id
          });
          return { id, count: response.data.data.length };
        })
      );

      const enrichedChannels = searchResponse.data.data.map(channel => {
        logger.info('Processing Twitch channel:', channel);
        return {
          ...channel,
          follower_count: followerCounts.find(fc => fc.id === channel.id)?.count || 0
        };
      });

      logger.info('Enriched channel data:', enrichedChannels);
      return enrichedChannels;
    } catch (error) {
      logger.error('Error searching channels:', error);
      throw error;
    }
  }

  async getChannel(userId: string) {
    return this.makeRequest('/channels', { broadcaster_id: userId });
  }

  async getVODs(userId: string, first: number = 100) {
    return this.makeRequest('/videos', {
      user_id: userId,
      first: first.toString(),
      type: 'archive'
    });
  }

  async getGame(gameId: string) {
    return this.makeRequest('/games', { id: gameId });
  }

  async searchGames(query: string) {
    return this.makeRequest('/search/categories', { query });
  }

  async getUser(username: string) {
    return this.makeRequest('/users', { login: username });
  }
}

export const twitchAPI = TwitchAPI.getInstance();

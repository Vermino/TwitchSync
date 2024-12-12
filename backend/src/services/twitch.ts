import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

interface TwitchCredentials {
  accessToken: string;
  expiresIn: number;
  obtainedAt: number;
}

interface TwitchVOD {
  id: string;
  user_id: string;
  user_login: string;
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
  type: string;
  duration: string;
}

interface TwitchGame {
  id: string;
  name: string;
  box_art_url: string;
}

interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
  created_at: string;
}

interface TwitchChannel {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  game_id: string;
  game_name: string;
  title: string;
  delay: number;
}

interface TwitchResponse<T> {
  data: T[];
  pagination?: {
    cursor?: string;
  };
}

class TwitchAPIService {
  private clientId: string;
  private clientSecret: string;
  private credentials: TwitchCredentials | null = null;
  private static instance: TwitchAPIService;

  private constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID || '';
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET || '';

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Twitch credentials not properly configured');
    }
  }

  public static getInstance(): TwitchAPIService {
    if (!TwitchAPIService.instance) {
      TwitchAPIService.instance = new TwitchAPIService();
    }
    return TwitchAPIService.instance;
  }

  private async getAccessToken(): Promise<string> {
    try {
      // Check if we have a valid cached token
      if (
        this.credentials &&
        Date.now() - this.credentials.obtainedAt < (this.credentials.expiresIn - 300) * 1000
      ) {
        return this.credentials.accessToken;
      }

      // Get new token
      const response = await axios.post<{ access_token: string; expires_in: number }>(
        `https://id.twitch.tv/oauth2/token?client_id=${this.clientId}&client_secret=${this.clientSecret}&grant_type=client_credentials`
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

  private async makeAuthorizedRequest<T>(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<AxiosResponse<TwitchResponse<T>>> {
    try {
      const accessToken = await this.getAccessToken();
      return await axios.get<TwitchResponse<T>>(`https://api.twitch.tv/helix${endpoint}`, {
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

  async getChannelVODs(userId: string, first: number = 100): Promise<TwitchVOD[]> {
    try {
      const response = await this.makeAuthorizedRequest<TwitchVOD>('/videos', {
        user_id: userId,
        first: first.toString(),
        type: 'archive',
      });
      return response.data.data;
    } catch (error) {
      logger.error('Failed to fetch channel VODs:', error);
      throw new Error('Failed to fetch channel VODs');
    }
  }

  async getGame(gameId: string): Promise<TwitchGame | null> {
    try {
      const response = await this.makeAuthorizedRequest<TwitchGame>('/games', {
        id: gameId,
      });
      return response.data.data[0] || null;
    } catch (error) {
      logger.error('Failed to fetch game info:', error);
      throw new Error('Failed to fetch game info');
    }
  }

  async searchGames(query: string): Promise<TwitchGame[]> {
    try {
      const response = await this.makeAuthorizedRequest<TwitchGame>('/search/categories', {
        query,
      });
      return response.data.data;
    } catch (error) {
      logger.error('Failed to search games:', error);
      throw new Error('Failed to search games');
    }
  }

  async getChannelInfo(username: string): Promise<TwitchUser | null> {
    try {
      const response = await this.makeAuthorizedRequest<TwitchUser>('/users', {
        login: username,
      });
      return response.data.data[0] || null;
    } catch (error) {
      logger.error('Failed to fetch channel info:', error);
      throw new Error('Failed to fetch channel info');
    }
  }

  async getCurrentGame(userId: string): Promise<string | null> {
    try {
      const response = await this.makeAuthorizedRequest<TwitchChannel>('/channels', {
        broadcaster_id: userId,
      });
      return response.data.data[0]?.game_id || null;
    } catch (error) {
      logger.error('Failed to fetch current game:', error);
      throw new Error('Failed to fetch current game');
    }
  }
}

export default TwitchAPIService;

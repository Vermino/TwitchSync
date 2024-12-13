import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

interface TwitchCredentials {
  accessToken: string;
  expiresIn: number;
  obtainedAt: number;
}

interface TwitchResponse<T> {
  data: T[];
  pagination?: {
    cursor?: string;
  };
}

interface TwitchChannel {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
}

interface TwitchGame {
  id: string;
  name: string;
  box_art_url: string;
  igdb_id?: string;
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
      if (
        this.credentials &&
        Date.now() - this.credentials.obtainedAt < (this.credentials.expiresIn - 300) * 1000
      ) {
        return this.credentials.accessToken;
      }

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
  ): Promise<TwitchResponse<T>> {
    try {
      const accessToken = await this.getAccessToken();
      const response = await axios.get<TwitchResponse<T>>(`https://api.twitch.tv/helix${endpoint}`, {
        headers: {
          'Client-ID': this.clientId,
          'Authorization': `Bearer ${accessToken}`,
        },
        params,
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to make Twitch API request to ${endpoint}:`, error);
      throw error;
    }
  }

  async searchChannels(query: string): Promise<TwitchResponse<TwitchChannel>> {
    return this.makeAuthorizedRequest<TwitchChannel>('/search/channels', {
      query,
      first: '20',
      live_only: 'false'
    });
  }

  async searchGames(query: string): Promise<TwitchResponse<TwitchGame>> {
    return this.makeAuthorizedRequest<TwitchGame>('/search/categories', {
      query,
      first: '20'
    });
  }

  async getChannelInfo(username: string): Promise<TwitchChannel | null> {
    try {
      const response = await this.makeAuthorizedRequest<TwitchChannel>('/users', {
        login: username,
      });
      return response.data[0] || null;
    } catch (error) {
      logger.error('Failed to fetch channel info:', error);
      throw error;
    }
  }

  async getCurrentGame(userId: string): Promise<string | null> {
    try {
      const response = await this.makeAuthorizedRequest<TwitchChannel>('/channels', {
        broadcaster_id: userId,
      });
      return response.data[0]?.id || null;
    } catch (error) {
      logger.error('Failed to fetch current game:', error);
      throw error;
    }
  }
}

export default TwitchAPIService;

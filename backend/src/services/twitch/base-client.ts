// Filepath: backend/src/services/twitch/base-client.ts

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { logger } from '../../utils/logger';
import { TwitchAPIResponse } from './types';

export class TwitchBaseClient {
  protected client: AxiosInstance;
  protected clientId: string;
  protected clientSecret: string;
  protected accessToken: string | null = null;
  protected tokenExpiration: number = 0;

  constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID || '';
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET || '';

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Twitch API credentials not configured');
    }

    this.client = axios.create({
      baseURL: 'https://api.twitch.tv/helix',
      headers: {
        'Client-Id': this.clientId
      }
    });
  }

  protected async refreshAccessToken(): Promise<string> {
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

      // Update client headers with new token
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;

      return this.accessToken;
    } catch (error) {
      logger.error('Failed to refresh Twitch access token:', error);
      throw new Error('Failed to obtain Twitch access token');
    }
  }

  protected async getAccessToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiration) {
      return this.refreshAccessToken();
    }
    return this.accessToken;
  }

  protected async makeRequest<T>(
    endpoint: string,
    params: Record<string, string | number | string[]> = {},
    config: Partial<AxiosRequestConfig> = {}
  ): Promise<TwitchAPIResponse<T>> {
    try {
      const token = await this.getAccessToken();

      const searchParams = new URLSearchParams();
      const allParams = { ...params, ...config.params };
      Object.entries(allParams).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, String(v)));
        } else if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });

      const response = await this.client.get<TwitchAPIResponse<T>>(endpoint, {
        ...config,
        headers: {
          ...config.headers,
          'Authorization': `Bearer ${token}`,
          'Client-Id': this.clientId
        },
        params: searchParams
      });
      return response.data;
    } catch (error) {
      logger.error(`Twitch API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  protected formatBoxArtUrl(url: string | null | undefined): string {
    if (!url) {
      return `/api/placeholder/285/380`;
    }

    if (url.includes('{width}') && url.includes('{height}')) {
      return url.replace('{width}x{height}', '285x380');
    }

    if (url.includes('-')) {
      return url.replace(/-\d+x\d+\./, '-285x380.');
    }

    return url;
  }
}

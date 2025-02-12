// Filepath: frontend/src/lib/api/discoveryClient.ts

import { BaseApiClient } from './baseClient';
import type {
  DiscoveryFeedResponse,
  DiscoveryPreferences,
  DiscoveryStats,
  ChannelRecommendation,
  GameRecommendation,
  RisingChannel,
  StreamPremiereEvent,
  TrackPremiereResponse,
  TrendingCategory,
  UpdatePreferencesResponse
} from '@/types/discovery';

export class DiscoveryClient extends BaseApiClient {
  async getDiscoveryFeed(): Promise<DiscoveryFeedResponse> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/discovery/feed`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching discovery feed:', error);
      throw this.handleError(error);
    }
  }

  async getPremieres(): Promise<StreamPremiereEvent[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/discovery/premieres`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching premieres:', error);
      throw this.handleError(error);
    }
  }

  async getRisingChannels(): Promise<RisingChannel[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/discovery/rising`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching rising channels:', error);
      throw this.handleError(error);
    }
  }

  async getChannelRecommendations(): Promise<ChannelRecommendation[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/discovery/recommendations/channels`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching channel recommendations:', error);
      throw this.handleError(error);
    }
  }

  async getGameRecommendations(): Promise<GameRecommendation[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/discovery/recommendations/games`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching game recommendations:', error);
      throw this.handleError(error);
    }
  }

  async getTrendingCategories(): Promise<TrendingCategory[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/discovery/trending`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching trending categories:', error);
      throw this.handleError(error);
    }
  }

  async trackPremiereEvent(id: string, config: {
    quality: string;
    retention: number;
    notify: boolean;
  }): Promise<TrackPremiereResponse> {
    try {
      const response = await this.axios.post(
        `${this.baseURL}/discovery/premieres/${id}/track`,
        config,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error tracking premiere event:', error);
      throw this.handleError(error);
    }
  }

  async updateDiscoveryPreferences(preferences: Partial<DiscoveryPreferences>): Promise<UpdatePreferencesResponse> {
    try {
      const response = await this.axios.put(
        `${this.baseURL}/discovery/preferences`,
        preferences,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error updating discovery preferences:', error);
      throw this.handleError(error);
    }
  }

  async getDiscoveryStats(): Promise<DiscoveryStats> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/discovery/stats`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching discovery stats:', error);
      throw this.handleError(error);
    }
  }
}

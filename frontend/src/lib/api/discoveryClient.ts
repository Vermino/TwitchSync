// Filepath: frontend/src/lib/api/discoveryClient.ts

import { BaseApiClient } from './baseClient';
import type {
  DiscoveryFeedResponse,
  DiscoveryPreferences,
  DiscoveryStats,
  ChannelRecommendation,
  GameRecommendation,
  TrendingCategory,
  UpdatePreferencesResponse,
  FilterSettings
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

  async getChannelRecommendations(filters?: FilterSettings): Promise<ChannelRecommendation[]> {
    try {
      const params = filters ? {
        min_viewers: filters.minViewers,
        max_viewers: filters.maxViewers,
        languages: filters.preferredLanguages?.join(','),
        tags: filters.tags?.join(','),
        confidence_threshold: filters.confidenceThreshold
      } : {};
      const response = await this.axios.get(
        `${this.baseURL}/discovery/recommendations/channels`,
        { headers: this.getHeaders(), params }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching channel recommendations:', error);
      throw this.handleError(error);
    }
  }

  async getGameRecommendations(filters?: FilterSettings): Promise<GameRecommendation[]> {
    try {
      const params = filters ? {
        min_viewers: filters.minViewers,
        max_viewers: filters.maxViewers,
        languages: filters.preferredLanguages?.join(','),
        tags: filters.tags?.join(','),
        confidence_threshold: filters.confidenceThreshold
      } : {};
      const response = await this.axios.get(
        `${this.baseURL}/discovery/recommendations/games`,
        { headers: this.getHeaders(), params }
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

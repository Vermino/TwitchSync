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
        confidence_threshold: filters.confidenceThreshold,
        game_ids: filters.gameIds?.join(',')
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
        confidence_threshold: filters.confidenceThreshold,
        game_ids: filters.gameIds?.join(',')
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
      // Map camelCase to snake_case for the backend
      const mappedPreferences: any = {};
      if (preferences.minViewers !== undefined) mappedPreferences.min_viewers = preferences.minViewers;
      if (preferences.maxViewers !== undefined) mappedPreferences.max_viewers = preferences.maxViewers;
      if (preferences.preferredLanguages !== undefined) mappedPreferences.preferred_languages = preferences.preferredLanguages;
      if (preferences.contentRating !== undefined) mappedPreferences.content_rating = preferences.contentRating;
      if (preferences.notifyOnly !== undefined) mappedPreferences.notify_only = preferences.notifyOnly;
      if (preferences.scheduleMatch !== undefined) mappedPreferences.schedule_match = preferences.scheduleMatch;
      if (preferences.confidenceThreshold !== undefined) mappedPreferences.confidence_threshold = preferences.confidenceThreshold;
      if (preferences.tags !== undefined) mappedPreferences.tags = preferences.tags;
      if (preferences.gameIds !== undefined) mappedPreferences.preferred_game_ids = preferences.gameIds;

      const response = await this.axios.put(
        `${this.baseURL}/discovery/preferences`,
        mappedPreferences,
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

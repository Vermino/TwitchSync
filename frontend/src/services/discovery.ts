// frontend/src/services/discovery.ts

import axios from 'axios';
import { api } from '@/lib/api';
import type {
  ChannelRecommendation,
  GameRecommendation,
  FilterSettings,
  DiscoveryFeedResponse,
  TrendingCategory
} from '@/types/discovery';

class DiscoveryService {
  async getChannelRecommendations(filters?: FilterSettings): Promise<ChannelRecommendation[]> {
    try {
      return await api.getChannelRecommendations(filters);
    } catch (error) {
      console.error('Error getting channel recommendations:', error);
      return [];
    }
  }

  async getGameRecommendations(filters?: FilterSettings): Promise<GameRecommendation[]> {
    try {
      return await api.getGameRecommendations(filters);
    } catch (error) {
      console.error('Error getting game recommendations:', error);
      return [];
    }
  }

  async getDiscoveryFeed(): Promise<DiscoveryFeedResponse> {
    try {
      return {
        preferences: {
          minViewers: 100,
          maxViewers: 50000,
          preferredLanguages: ['EN'],
          contentRating: 'all',
          notifyOnly: false,
          confidenceThreshold: 0.7
        },
        recommendations: {
          channels: await api.getChannelRecommendations(),
          games: await api.getGameRecommendations()
        },
        trending: [],
        stats: {
          pendingArchives: 0,
          todayDiscovered: 0
        }
      };
    } catch (error) {
      console.error('Error getting discovery feed:', error);
      // Return empty/default response
      return {
        preferences: {
          minViewers: 100,
          maxViewers: 50000,
          preferredLanguages: ['EN'],
          contentRating: 'all',
          notifyOnly: false,
          confidenceThreshold: 0.7
        },
        recommendations: {
          channels: [],
          games: []
        },
        trending: [],
        stats: {
          pendingArchives: 0,
          todayDiscovered: 0
        }
      };
    }
  }



  async getTrendingCategories(): Promise<TrendingCategory[]> {
    try {
      // For development, return mock data
      // In production, this would make actual API calls
      return [];
    } catch (error) {
      console.error('Error getting trending categories:', error);
      return [];
    }
  }



  async ignoreChannel(channelId: string): Promise<void> {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(
        `/api/discovery/channels/ignore`,
        { channel_id: channelId },
        { headers: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' } }
      );
    } catch (error) {
      console.error('Error ignoring channel:', error);
      throw error;
    }
  }

  async ignoreGame(gameId: string): Promise<void> {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(
        `/api/discovery/games/ignore`,
        { game_id: gameId },
        { headers: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' } }
      );
    } catch (error) {
      console.error('Error ignoring game:', error);
      throw error;
    }
  }
}

export const discoveryService = new DiscoveryService();
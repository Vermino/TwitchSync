// frontend/src/services/discovery/index.ts

import axios from 'axios';
import type {
  ChannelRecommendation,
  GameRecommendation,
  DiscoveryPreferences,
  FilterSettings
} from '@/types/discovery';

export class DiscoveryService {
  private baseURL = '/api/discovery';

  private getHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  async getChannelRecommendations(preferences: FilterSettings): Promise<ChannelRecommendation[]> {
    try {
      const response = await axios.get(`${this.baseURL}/recommendations/channels`, {
        headers: this.getHeaders(),
        params: preferences
      });
      return response.data;
    } catch (error) {
      console.error('Error getting channel recommendations:', error);
      throw error;
    }
  }

  async getGameRecommendations(preferences: FilterSettings): Promise<GameRecommendation[]> {
    try {
      const response = await axios.get(`${this.baseURL}/recommendations/games`, {
        headers: this.getHeaders(),
        params: preferences
      });
      return response.data;
    } catch (error) {
      console.error('Error getting game recommendations:', error);
      throw error;
    }
  }
}

export const discoveryService = new DiscoveryService();

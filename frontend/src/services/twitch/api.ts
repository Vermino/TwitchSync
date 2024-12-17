// frontend/src/services/twitch/api.ts

import axios from 'axios';

interface TwitchStream {
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  viewer_count: number;
  started_at: string;
  language: string;
  tags: string[];
}

interface TwitchGame {
  id: string;
  name: string;
  box_art_url: string;
}

export class TwitchAPIService {
  private baseURL = 'http://localhost:3001/api/twitch';

  // Use backend proxy instead of direct Twitch API calls
  private getHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  async getTopStreams(params: {
    first?: number;
    language?: string[];
    game_id?: string;
  } = {}) {
    try {
      const response = await axios.get(`${this.baseURL}/streams`, {
        headers: this.getHeaders(),
        params: {
          first: params.first || 100,
          language: params.language?.join(','),
          game_id: params.game_id
        }
      });
      return response.data as TwitchStream[];
    } catch (error) {
      console.error('Error fetching Twitch streams:', error);
      throw error;
    }
  }

  async getTopGames(first: number = 100) {
    try {
      const response = await axios.get(`${this.baseURL}/games/top`, {
        headers: this.getHeaders(),
        params: { first }
      });
      return response.data as TwitchGame[];
    } catch (error) {
      console.error('Error fetching Twitch games:', error);
      throw error;
    }
  }

  async getChannelsByIds(ids: string[]) {
    try {
      const response = await axios.get(`${this.baseURL}/users`, {
        headers: this.getHeaders(),
        params: { ids: ids.join(',') }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching Twitch channels:', error);
      throw error;
    }
  }

  async getGamesByIds(ids: string[]) {
    try {
      const response = await axios.get(`${this.baseURL}/games`, {
        headers: this.getHeaders(),
        params: { ids: ids.join(',') }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching Twitch games:', error);
      throw error;
    }
  }
}

export const twitchApi = new TwitchAPIService();

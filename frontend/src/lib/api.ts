import axios from 'axios';
import type { Channel, Game } from '@/types';

class ApiClient {
  private static instance: ApiClient;
  private baseURL = 'http://localhost:3001/api';

    // Twitch Search
  async searchTwitchChannels(query: string) {
    try {
      const response = await axios.get(`${this.baseURL}/twitch/channels/search`, {
        params: { query },
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error searching Twitch channels:', error);
      throw error;
    }
  }

  async searchTwitchGames(query: string) {
    try {
      const response = await axios.get(`${this.baseURL}/twitch/games/search`, {
        params: { query },
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error searching Twitch games:', error);
      throw error;
    }
  }

  private constructor() {
    // Add request interceptor for auth token
    axios.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Handle unauthorized access
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  // Channels
  async getChannels(): Promise<Channel[]> {
    try {
      const response = await axios.get(`${this.baseURL}/channels`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching channels:', error);
      throw error;
    }
  }

  async createChannel(data: { twitch_id: string; username: string }): Promise<Channel> {
    try {
      const response = await axios.post(`${this.baseURL}/channels`, data, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error creating channel:', error);
      throw error;
    }
  }

  async updateChannel(id: number, data: { is_active?: boolean }): Promise<Channel> {
    try {
      const response = await axios.put(`${this.baseURL}/channels/${id}`, data, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error updating channel:', error);
      throw error;
    }
  }

  async deleteChannel(id: number): Promise<void> {
    try {
      await axios.delete(`${this.baseURL}/channels/${id}`, {
        headers: this.getHeaders()
      });
    } catch (error) {
      console.error('Error deleting channel:', error);
      throw error;
    }
  }

  // Games
  async getGames(): Promise<Game[]> {
    try {
      const response = await axios.get(`${this.baseURL}/games`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching games:', error);
      throw error;
    }
  }

  async createGame(data: { twitch_game_id: string; name: string }): Promise<Game> {
    try {
      const response = await axios.post(`${this.baseURL}/games`, data, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error creating game:', error);
      throw error;
    }
  }

  async updateGame(id: number, data: { is_active?: boolean }): Promise<Game> {
    try {
      const response = await axios.put(`${this.baseURL}/games/${id}`, data, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error updating game:', error);
      throw error;
    }
  }

  async deleteGame(id: number): Promise<void> {
    try {
      await axios.delete(`${this.baseURL}/games/${id}`, {
        headers: this.getHeaders()
      });
    } catch (error) {
      console.error('Error deleting game:', error);
      throw error;
    }
  }

  // Helper method for headers
  private getHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  // Dashboard stats
  async getDashboardStats() {
    try {
      const response = await axios.get(`${this.baseURL}/dashboard/stats`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }
}


export const api = ApiClient.getInstance();
export default api;

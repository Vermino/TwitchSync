// frontend/src/lib/api.ts

import axios from 'axios';
import type { Channel, Game, Task } from '@/types';

class ApiClient {
  private static instance: ApiClient;
  private baseURL = 'http://localhost:3001/api';

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

  async createChannel(data: {
    twitch_id: string;
    username: string;
    display_name?: string;
    profile_image_url?: string;
    description?: string;
    follower_count?: number;
  }): Promise<Channel> {
    try {
      const response = await axios.post(
        `${this.baseURL}/channels`,
        {
          twitch_id: data.twitch_id,
          username: data.username,
          display_name: data.display_name || data.username,
          profile_image_url: data.profile_image_url || null,
          description: data.description || null,
          follower_count: data.follower_count || 0
        },
        {
          headers: this.getHeaders()
        }
      );
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

  // Tasks
  async getTasks(): Promise<Task[]> {
    try {
      const response = await axios.get(`${this.baseURL}/tasks`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching tasks:', error);
      throw error;
    }
  }

  async createTask(data: {
    type: string;
    config: Record<string, any>;
  }): Promise<Task> {
    try {
      const response = await axios.post(`${this.baseURL}/tasks`, data, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  }

  async updateTask(id: number, data: Partial<Task>): Promise<Task> {
    try {
      const response = await axios.put(`${this.baseURL}/tasks/${id}`, data, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }

  async deleteTask(id: number): Promise<void> {
    try {
      await axios.delete(`${this.baseURL}/tasks/${id}`, {
        headers: this.getHeaders()
      });
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
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

  // Helper method for headers
  private getHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  // Discovery Methods
  async getDiscoveryFeed() {
    try {
      const response = await axios.get(`${this.baseURL}/discovery/feed`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching discovery feed:', error);
      throw error;
    }
  }

  async updateDiscoveryPreferences(preferences: {
    minConfidence: number;
    autoTrack: boolean;
    preferredLanguages: string[];
  }) {
    try {
      const response = await axios.put(
        `${this.baseURL}/discovery/preferences`,
        preferences,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error updating discovery preferences:', error);
      throw error;
    }
  }

  // Settings Methods
  async getUserSettings() {
    try {
      const response = await axios.get(`${this.baseURL}/settings`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching user settings:', error);
      throw error;
    }
  }

  async updateUserSettings(settings: {
    notifications?: Record<string, boolean>;
    discovery?: Record<string, any>;
    schedule?: Record<string, any>;
  }) {
    try {
      const response = await axios.put(
        `${this.baseURL}/settings`,
        settings,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error updating user settings:', error);
      throw error;
    }
  }

  // Error Handling Helper
  handleError(error: any): string {
    if (axios.isAxiosError(error)) {
      return error.response?.data?.message || error.message;
    }
    return error instanceof Error ? error.message : 'An unknown error occurred';
  }
}

export const api = ApiClient.getInstance();
export default api;

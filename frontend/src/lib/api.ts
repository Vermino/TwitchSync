// Filepath: frontend/src/lib/api.ts

import axios from 'axios';
import type { Channel, Game, Task } from '@/types';
import type { SystemSettings, StorageStats } from '@/types/settings';
import type {
  ChannelRecommendation,
  DiscoveryFeedResponse,
  DiscoveryPreferences,
  DiscoveryStats,
  GameRecommendation,
  RisingChannel,
  StreamPremiereEvent,
  TrackPremiereResponse,
  TrendingCategory,
  UpdatePreferencesResponse
} from '@/types/discovery';
import {
  CreateTaskRequest,
  TaskDetails,
  TaskProgress,
  TaskStorage,
  UpdateTaskRequest
} from "@/types";

class ApiClient {
  private static instance: ApiClient;
  private baseURL = 'http://localhost:3001/api';
  private authURL = 'http://localhost:3001/auth';

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
            localStorage.removeItem('auth_token');
            window.location.href = '/login';
          }
          // Extract and throw the error message
          if (error.response?.data?.error) {
            throw new Error(error.response.data.error);
          }
          if (error.response?.data?.details) {
            const details = error.response.data.details;
            const messages = details.map((detail: any) => detail.message);
            throw new Error(messages.join(', '));
          }
          throw error;
        }
    );
  }

  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  // Task Methods
  async getTasks(): Promise<Task[]> {
    try {
      const response = await axios.get(
          `${this.baseURL}/tasks`,
          { headers: this.getHeaders() }
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error('Error fetching tasks:', error);
      throw this.handleError(error);
    }
  }

  // [Previous methods remain exactly the same]
  // Add Authentication Methods
  async twitchCallback(code: string) {
    try {
      const response = await axios.post(
          `${this.authURL}/twitch/callback`,
          { code },
          {
            headers: {
              'Content-Type': 'application/json'
            }
          }
      );
      return response.data;
    } catch (error) {
      console.error('Error during Twitch callback:', error);
      throw this.handleError(error);
    }
  }

  async checkAuth() {
    try {
      const response = await axios.get(`${this.authURL}/me`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error checking auth status:', error);
      throw this.handleError(error);
    }
  }

  async logout() {
    try {
      const response = await axios.post(
          `${this.authURL}/logout`,
          {},
          { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error during logout:', error);
      throw this.handleError(error);
    }
  }

  async revokeTwitchAccess() {
    try {
      const response = await axios.post(
          `${this.authURL}/twitch/revoke`,
          {},
          { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error revoking Twitch access:', error);
      throw this.handleError(error);
    }
  }

  // Dashboard Methods
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const response = await axios.get(`${this.baseURL}/dashboard/stats`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw this.handleError(error);
    }
  }

  // Settings Methods
  async getSystemSettings(): Promise<SystemSettings> {
    try {
      const response = await axios.get(`${this.baseURL}/settings/system`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching system settings:', error);
      throw this.handleError(error);
    }
  }

  async updateSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    try {
      const response = await axios.put(
          `${this.baseURL}/settings/system`,
          settings,
          { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error updating system settings:', error);
      throw this.handleError(error);
    }
  }

  async getStorageStats(): Promise<StorageStats> {
    try {
      const response = await axios.get(`${this.baseURL}/system/storage`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching storage stats:', error);
      throw this.handleError(error);
    }
  }

  // Twitch Search Methods
  async searchTwitchChannels(query: string) {
    try {
      const response = await axios.get(`${this.baseURL}/twitch/channels/search`, {
        params: { query },
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error searching Twitch channels:', error);
      throw this.handleError(error);
    }
  }

  async searchTwitchGames(query: string) {
    try {
      const response = await axios.get(`${this.baseURL}/twitch/games/search`, {
        params: { query },
        headers: this.getHeaders()
      });
      return response.data.map((game: any) => ({
        ...game,
        box_art_url: game.box_art_url || null,
        category: game.category || game.name.split(' ')[0].toLowerCase(),
        tags: game.tags || [],
        status: game.status || 'active',
        is_active: true
      }));
    } catch (error) {
      console.error('Error searching Twitch games:', error);
      throw this.handleError(error);
    }
  }

  // Channel Methods
  async getChannels(): Promise<Channel[]> {
    try {
      const response = await axios.get(`${this.baseURL}/channels`, {
        headers: this.getHeaders()
      });

      const channelsData = response.data.channels || response.data;
      if (Array.isArray(channelsData)) {
        return channelsData.map(channel => ({
          id: channel.id,
          twitch_id: channel.twitch_id,
          username: channel.username,
          display_name: channel.display_name || channel.username,
          profile_image_url: channel.profile_image_url,
          description: channel.description || '',
          follower_count: channel.follower_count || 0,
          is_active: channel.is_active || true,
          is_live: channel.is_live || false,
          last_stream_date: channel.last_stream_date,
          last_game_id: channel.last_game_id,
          last_game_name: channel.last_game_name,
          last_game_box_art: channel.last_game_box_art,
          most_played_game: channel.most_played_game,
          premieres: channel.premieres || []
        }));
      }
      return [];
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
      if (!data.username) {
        throw new Error('Username is required');
      }

      const response = await axios.post(
          `${this.baseURL}/channels`,
          {
            twitch_id: data.twitch_id,
            username: data.username,
            display_name: data.display_name || data.username,
            profile_image_url: data.profile_image_url || null,
            description: data.description || '',
            follower_count: data.follower_count || 0,
            is_active: true
          },
          { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error creating channel:', error);
      throw this.handleError(error);
    }
  }

  async updateChannel(id: number, data: { is_active?: boolean }): Promise<Channel> {
    try {
      const response = await axios.put(
          `${this.baseURL}/channels/${id}`,
          data,
          { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error updating channel:', error);
      throw this.handleError(error);
    }
  }

  async deleteChannel(id: number): Promise<void> {
    try {
      await axios.delete(`${this.baseURL}/channels/${id}`, {
        headers: this.getHeaders()
      });
    } catch (error) {
      console.error('Error deleting channel:', error);
      throw this.handleError(error);
    }
  }

  // Game Methods
  async getGames(): Promise<Game[]> {
    try {
      const response = await axios.get(`${this.baseURL}/games`, {
        headers: this.getHeaders()
      });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error('Error fetching games:', error);
      throw error;
    }
  }

  async createGame(data: {
    twitch_game_id: string;
    name: string;
    box_art_url?: string;
    category?: string;
    tags?: string[];
    status?: string;
    is_active?: boolean;
  }): Promise<Game> {
    try {
      const response = await axios.post(
          `${this.baseURL}/games`,
          {
            twitch_game_id: data.twitch_game_id,
            name: data.name,
            box_art_url: data.box_art_url,
            category: data.category || data.name.split(' ')[0].toLowerCase(),
            tags: data.tags || [],
            status: data.status || 'active',
            is_active: data.is_active !== undefined ? data.is_active : true
          },
          { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error creating game:', error);
      throw error;
    }
  }

  async updateGame(id: number, data: { is_active?: boolean }): Promise<Game> {
    try {
      const response = await axios.put(
          `${this.baseURL}/games/${id}`,
          data,
          { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error updating game:', error);
      throw this.handleError(error);
    }
  }

  async deleteGame(id: number): Promise<void> {
    try {
      await axios.delete(`${this.baseURL}/games/${id}`, {
        headers: this.getHeaders()
      });
    } catch (error) {
      console.error('Error deleting game:', error);
      throw this.handleError(error);
    }
  }

  // Task Methods
  async createTask(data: CreateTaskRequest): Promise<Task> {
    try {
      // Create task data with defaults
      const taskData = {
        name: data.name || '',
        description: data.description || '',
        task_type: data.task_type || 'combined',
        channel_ids: data.channel_ids || [],
        game_ids: data.game_ids || [],
        schedule_type: data.schedule_type || 'interval',
        schedule_value: data.schedule_value || '3600',
        storage_limit_gb: Number(data.storage_limit_gb) || 0,
        retention_days: Number(data.retention_days) || 7,
        auto_delete: Boolean(data.auto_delete),
        priority: data.priority || 'normal',
        is_active: true,
        conditions: data.conditions || {},
        restrictions: data.restrictions || {}
      };

      // Basic validation for retention days
      if (taskData.retention_days < 1 || taskData.retention_days > 365) {
        throw new Error('Retention days must be between 1 and 365');
      }

      const response = await axios.post(
          `${this.baseURL}/tasks`,
          taskData,
          { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  }

  async updateTask(id: number, data: UpdateTaskRequest): Promise<Task> {
    try {
      // Format numerical fields
      const updateData = {
        ...data,
        storage_limit_gb: data.storage_limit_gb !== undefined ? Number(data.storage_limit_gb) : undefined,
        retention_days: data.retention_days !== undefined ? Number(data.retention_days) : undefined
      };

      if (updateData.retention_days && (updateData.retention_days < 1 || updateData.retention_days > 365)) {
        throw new Error('Retention days must be between 1 and 365');
      }

      const response = await axios.put(
          `${this.baseURL}/tasks/${id}`,
          updateData,
          { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }

  async getTask(id: number, path: string): Promise<void> {
    try {
      await axios.put(
          `${this.baseURL}/tasks/${id}/path`,
          { path },
          { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error updating task path:', error);
      throw this.handleError(error);
    }
  }

  async getTaskDetails(id: number): Promise<TaskDetails> {
    try {
      const response = await axios.get(
          `${this.baseURL}/tasks/${id}/details`,
          { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching task details:', error);
      throw error;
    }
  }

  async deleteTask(id: number): Promise<void> {
    try {
      await axios.delete(
          `${this.baseURL}/tasks/${id}`,
          { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  }

  async updateTaskPath(id: number, path: string): Promise<void> {
    try {
      await axios.put(
          `${this.baseURL}/tasks/${id}/path`,
          { path },
          { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error updating task path:', error);
      throw error;
    }
  }

  // Task Progress Methods
  async getTaskProgress(id: number): Promise<TaskProgress> {
    try {
      const response = await axios.get(
          `${this.baseURL}/tasks/${id}/progress`,
          { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching task progress:', error);
      throw error;
    }
  }

  async getTaskStorage(id: number): Promise<TaskStorage> {
    try {
      const response = await axios.get(
          `${this.baseURL}/tasks/${id}/storage`,
          { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching task storage:', error);
      throw error;
    }
  }

  async runTask(id: number): Promise<void> {
    try {
      await axios.post(
          `${this.baseURL}/tasks/${id}/run`,
          {},
          { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error running task:', error);
      throw error;
    }
  }

  // Discovery Methods
  async getDiscoveryFeed(): Promise<DiscoveryFeedResponse> {
    try {
      const response = await axios.get(`${this.baseURL}/discovery/feed`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching discovery feed:', error);
      throw this.handleError(error);
    }
  }

  async getPremieres(): Promise<StreamPremiereEvent[]> {
    try {
      const response = await axios.get(`${this.baseURL}/discovery/premieres`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching premieres:', error);
      throw this.handleError(error);
    }
  }

  async getRisingChannels(): Promise<RisingChannel[]> {
    try {
      const response = await axios.get(`${this.baseURL}/discovery/rising`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching rising channels:', error);
      throw this.handleError(error);
    }
  }

  async getChannelRecommendations(): Promise<ChannelRecommendation[]> {
    try {
      const response = await axios.get(`${this.baseURL}/discovery/recommendations/channels`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching channel recommendations:', error);
      throw this.handleError(error);
    }
  }

  async getGameRecommendations(): Promise<GameRecommendation[]> {
    try {
      const response = await axios.get(`${this.baseURL}/discovery/recommendations/games`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching game recommendations:', error);
      throw this.handleError(error);
    }
  }

  async trackChannel(channelId: string, options: {
    quality?: 'best' | 'high' | 'medium' | 'low';
    notifications?: boolean;
    autoArchive?: boolean;
  } = {}): Promise<void> {
    try {
      await axios.post(
          `${this.baseURL}/channels/track/${channelId}`,
          options,
          { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error tracking channel:', error);
      throw this.handleError(error);
    }
  }

  async trackGame(gameId: string, options: {
    notifications?: boolean;
    autoArchive?: boolean;
  } = {}): Promise<void> {
    try {
      await axios.post(
          `${this.baseURL}/games/track/${gameId}`,
          options,
          { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error tracking game:', error);
      throw this.handleError(error);
    }
  }

  async getTrendingCategories(): Promise<TrendingCategory[]> {
    try {
      const response = await axios.get(`${this.baseURL}/discovery/trending`, {
        headers: this.getHeaders()
      });
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
      const response = await axios.post(
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
      const response = await axios.put(
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
      const response = await axios.get(`${this.baseURL}/discovery/stats`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching discovery stats:', error);
      throw this.handleError(error);
    }
  }

  // VOD Methods
  async getVods() {
    try {
      const response = await axios.get(`${this.baseURL}/vods`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching VODs:', error);
      throw this.handleError(error);
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
      throw this.handleError(error);
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
      throw this.handleError(error);
    }
  }

  // Utility Methods
  private getHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }

  private handleError(error: any): never {
    console.error('API Error:', error);

    if (axios.isAxiosError(error)) {
      if (error.response?.data?.details) {
        const details = error.response.data.details;
        const messages = details.map((detail: any) => detail.message);
        throw new Error(messages.join(', '));
      }
      throw new Error(error.response?.data?.message || error.message);
    }

    throw error instanceof Error ? error : new Error('An unknown error occurred');
  }
}

export const api = ApiClient.getInstance();
export default api;
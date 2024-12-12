import axios from 'axios';
import type {
  DashboardStats,
  Channel,
  Game,
  VOD,
  CreateChannelRequest,
  UpdateChannelRequest,
  CreateGameRequest,
  UpdateGameRequest,
  PaginatedResponse,
  Chapter
} from '../types';

const BASE_URL = 'http://localhost:3000/api';

class ApiClient {
  private static instance: ApiClient;

  private constructor() {
    // Initialize axios defaults if needed
    axios.defaults.headers.common['Content-Type'] = 'application/json';
  }

  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  // Dashboard
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const response = await axios.get<DashboardStats>(`${BASE_URL}/dashboard/stats`);
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

  // Channels
  async getChannels(): Promise<Channel[]> {
    try {
      const response = await axios.get<Channel[]>(`${BASE_URL}/channels`);
      return response.data;
    } catch (error) {
      console.error('Error fetching channels:', error);
      throw error;
    }
  }

  async createChannel(data: CreateChannelRequest): Promise<Channel> {
    try {
      const response = await axios.post<Channel>(`${BASE_URL}/channels`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating channel:', error);
      throw error;
    }
  }

  async updateChannel(id: number, data: UpdateChannelRequest): Promise<Channel> {
    try {
      const response = await axios.put<Channel>(`${BASE_URL}/channels/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating channel:', error);
      throw error;
    }
  }

  async deleteChannel(id: number): Promise<void> {
    try {
      await axios.delete(`${BASE_URL}/channels/${id}`);
    } catch (error) {
      console.error('Error deleting channel:', error);
      throw error;
    }
  }

  // Games
  async getGames(): Promise<Game[]> {
    try {
      const response = await axios.get<Game[]>(`${BASE_URL}/games`);
      return response.data;
    } catch (error) {
      console.error('Error fetching games:', error);
      throw error;
    }
  }

  async createGame(data: CreateGameRequest): Promise<Game> {
    try {
      const response = await axios.post<Game>(`${BASE_URL}/games`, data);
      return response.data;
    } catch (error) {
      console.error('Error creating game:', error);
      throw error;
    }
  }

  async updateGame(id: number, data: UpdateGameRequest): Promise<Game> {
    try {
      const response = await axios.put<Game>(`${BASE_URL}/games/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating game:', error);
      throw error;
    }
  }

  async deleteGame(id: number): Promise<void> {
    try {
      await axios.delete(`${BASE_URL}/games/${id}`);
    } catch (error) {
      console.error('Error deleting game:', error);
      throw error;
    }
  }

  // VODs
  async getVODs(page: number = 1, limit: number = 20): Promise<PaginatedResponse<VOD>> {
    try {
      const response = await axios.get<PaginatedResponse<VOD>>(`${BASE_URL}/vods`, {
        params: { page, limit }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching VODs:', error);
      throw error;
    }
  }

  async getVOD(id: number): Promise<VOD> {
    try {
      const response = await axios.get<VOD>(`${BASE_URL}/vods/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching VOD:', error);
      throw error;
    }
  }

  async getChannelVODs(channelId: number): Promise<VOD[]> {
    try {
      const response = await axios.get<VOD[]>(`${BASE_URL}/vods/channel/${channelId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching channel VODs:', error);
      throw error;
    }
  }

  // Chapters
  async getVODChapters(vodId: number): Promise<Chapter[]> {
    try {
      const response = await axios.get<Chapter[]>(`${BASE_URL}/vods/${vodId}/chapters`);
      return response.data;
    } catch (error) {
      console.error('Error fetching VOD chapters:', error);
      throw error;
    }
  }

  async analyzeVOD(vodId: number): Promise<void> {
    try {
      await axios.post(`${BASE_URL}/vods/${vodId}/analyze`);
    } catch (error) {
      console.error('Error analyzing VOD:', error);
      throw error;
    }
  }

  async reanalyzeVOD(vodId: number): Promise<void> {
    try {
      await axios.post(`${BASE_URL}/vods/${vodId}/reanalyze`);
    } catch (error) {
      console.error('Error reanalyzing VOD:', error);
      throw error;
    }
  }

  handleError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      return error.response?.data?.message || 'An unexpected error occurred';
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'An unexpected error occurred';
  }
}

// Export a singleton instance
export const api = ApiClient.getInstance();
export default api;

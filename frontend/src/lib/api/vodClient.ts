// Filepath: frontend/src/lib/api/vodClient.ts

import { BaseApiClient } from './baseClient';

export interface VodData {
  id: string;
  stream_id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: string;
  duration: string;
  muted_segments: null | Array<{
    duration: number;
    offset: number;
  }>;
}

export class VodClient extends BaseApiClient {
  async getVods(): Promise<VodData[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/vods`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching VODs:', error);
      throw this.handleError(error);
    }
  }

  async getVodById(vodId: string): Promise<VodData> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/vods/${vodId}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching VOD by ID:', error);
      throw this.handleError(error);
    }
  }

  async deleteVod(vodId: string): Promise<void> {
    try {
      await this.axios.delete(
        `${this.baseURL}/vods/${vodId}`,
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error deleting VOD:', error);
      throw this.handleError(error);
    }
  }

  async getVodsByChannel(channelId: string): Promise<VodData[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/channels/${channelId}/vods`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching VODs by channel:', error);
      throw this.handleError(error);
    }
  }

  async getVodsByGame(gameId: string): Promise<VodData[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/games/${gameId}/vods`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching VODs by game:', error);
      throw this.handleError(error);
    }
  }
}

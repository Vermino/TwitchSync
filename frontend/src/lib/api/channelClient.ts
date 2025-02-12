// Filepath: frontend/src/lib/api/channelClient.ts

import { BaseApiClient } from './baseClient';
import type { Channel } from '@/types';

export class ChannelClient extends BaseApiClient {
  async getChannels(): Promise<Channel[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/channels`,
        { headers: this.getHeaders() }
      );

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
      throw this.handleError(error);
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

      const response = await this.axios.post(
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
      const response = await this.axios.put(
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
      await this.axios.delete(
        `${this.baseURL}/channels/${id}`,
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error deleting channel:', error);
      throw this.handleError(error);
    }
  }
}

// Filepath: frontend/src/lib/api/gameClient.ts

import { BaseApiClient } from './baseClient';
import type { Game } from '@/types';

export class GameClient extends BaseApiClient {
  async getGames(): Promise<Game[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/games`,
        { headers: this.getHeaders() }
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error('Error fetching games:', error);
      throw this.handleError(error);
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
      const response = await this.axios.post(
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
      throw this.handleError(error);
    }
  }

  async updateGame(id: number, data: { is_active?: boolean }): Promise<Game> {
    try {
      const response = await this.axios.put(
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
      await this.axios.delete(
        `${this.baseURL}/games/${id}`,
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error deleting game:', error);
      throw this.handleError(error);
    }
  }

  async searchTwitchGames(query: string) {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/twitch/games/search`,
        {
          params: { query },
          headers: this.getHeaders()
        }
      );
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
}

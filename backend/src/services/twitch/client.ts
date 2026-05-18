import { TwitchAPIClient } from './api-client';
import { logger } from '../../utils/logger';

class TwitchClient {
  private api: TwitchAPIClient;
  private static instance: TwitchClient;

  private constructor() {
    this.api = TwitchAPIClient.getInstance();
  }

  public static getInstance(): TwitchClient {
    if (!TwitchClient.instance) {
      TwitchClient.instance = new TwitchClient();
    }
    return TwitchClient.instance;
  }

  async getChannelVODs(userId: string, first: number = 100) {
    try {
      const response = await this.api.getVODs(userId, first);
      return response;
    } catch (error) {
      logger.error('Failed to fetch channel VODs:', error);
      throw new Error('Failed to fetch channel VODs');
    }
  }

  async getGame(gameId: string) {
    try {
      const response = await this.api.getGame(gameId);
      return response;
    } catch (error) {
      logger.error('Failed to fetch game info:', error);
      throw new Error('Failed to fetch game info');
    }
  }

  async searchGames(query: string) {
    try {
      const response = await this.api.searchGames(query);
      return response;
    } catch (error) {
      logger.error('Failed to search games:', error);
      throw new Error('Failed to search games');
    }
  }

  async getChannelInfo(username: string) {
    try {
      const response = await this.api.getUser(username);
      return response;
    } catch (error) {
      logger.error('Failed to fetch channel info:', error);
      throw new Error('Failed to fetch channel info');
    }
  }

  async getCurrentGame(userId: string) {
    try {
      const response = await this.api.getChannel(userId);
      return response?.game_id || null;
    } catch (error) {
      logger.error('Failed to fetch current game:', error);
      throw new Error('Failed to fetch current game');
    }
  }
}

export const twitchClient = TwitchClient.getInstance();
export default twitchClient;

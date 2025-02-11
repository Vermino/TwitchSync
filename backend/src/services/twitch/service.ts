// Filepath: backend/src/services/twitch/service.ts

import { logger } from '../../utils/logger';
import { TwitchAPIClient } from './api-client';
import {
  ITwitchService,
  TwitchVOD,
  TwitchGame,
  EnrichedGame,
  EnrichedChannel,
  StreamFilters,
  PlaylistData,
  TwitchChannel
} from './types';

export class TwitchService implements ITwitchService {
  private static instance: TwitchService;
  readonly apiClient: TwitchAPIClient;

  private constructor() {
    this.apiClient = TwitchAPIClient.getInstance();
  }

  public static getInstance(): TwitchService {
    if (!TwitchService.instance) {
      TwitchService.instance = new TwitchService();
    }
    return TwitchService.instance;
  }

  // Rest of the implementation remains the same...
  async searchChannels(query: string): Promise<EnrichedChannel[]> {
    try {
      // First search for channels
      const channels = await this.apiClient.searchChannels(query);

      // Enrich the channels with additional data
      const enrichedChannels = await Promise.all(
        channels.map(async (channel) => {
          try {
            const currentGame = await this.getCurrentGame(channel.id);
            const followerCount = await this.getChannelFollowers(channel.id);

            return {
              ...channel,
              twitch_id: channel.id,
              username: channel.login,
              current_game: currentGame ? {
                id: currentGame.id,
                name: currentGame.name,
                box_art_url: currentGame.box_art_url
              } : undefined,
              is_live: !!currentGame,
              follower_count: followerCount,
              tags: []
            };
          } catch (error) {
            logger.error(`Error enriching channel ${channel.display_name}:`, error);
            return {
              ...channel,
              twitch_id: channel.id,
              username: channel.login,
              follower_count: 0,
              is_live: false,
              tags: []
            };
          }
        })
      );

      return enrichedChannels;
    } catch (error) {
      logger.error('Error searching channels:', error);
      throw error;
    }
  }

  async getChannelFollowers(channelId: string): Promise<number> {
    try {
      return await this.apiClient.getFollowerCount(channelId);
    } catch (error) {
      logger.error(`Error getting follower count for channel ${channelId}:`, error);
      return 0;
    }
  }

  async getChannelVODs(userId: string): Promise<TwitchVOD[]> {
    try {
      return await this.apiClient.getVODs(userId);
    } catch (error) {
      logger.error(`Failed to fetch VODs for channel ${userId}:`, error);
      throw new Error(`Failed to fetch channel VODs: ${error}`);
    }
  }

  async getVODInfo(vodId: string): Promise<TwitchVOD | null> {
    try {
      return await this.apiClient.getVODInfo(vodId);
    } catch (error) {
      logger.error(`Failed to fetch VOD info for ${vodId}:`, error);
      throw new Error(`Failed to fetch VOD info: ${error}`);
    }
  }

  async getVODPlaylist(vodId: string, quality?: string): Promise<PlaylistData | null> {
    try {
      return await this.apiClient.getVODPlaylist(vodId, quality);
    } catch (error) {
      logger.error(`Failed to fetch VOD playlist for ${vodId}:`, error);
      throw new Error(`Failed to fetch VOD playlist: ${error}`);
    }
  }

  async getGameById(gameId: string): Promise<EnrichedGame | null> {
    try {
      const game = await this.apiClient.getGame(gameId);
      if (!game) return null;

      return {
        ...game,
        category: game.name.split(' ')[0].toLowerCase(),
        tags: [],
        last_checked: new Date().toISOString(),
        status: 'active',
        is_active: true
      };
    } catch (error) {
      logger.error(`Failed to fetch game ${gameId}:`, error);
      throw new Error(`Failed to fetch game: ${error}`);
    }
  }

  async searchGames(query: string): Promise<EnrichedGame[]> {
    try {
      const games = await this.apiClient.searchGames(query);
      return games.map(game => ({
        ...game,
        category: game.name.split(' ')[0].toLowerCase(),
        tags: [],
        last_checked: new Date().toISOString(),
        status: 'active',
        is_active: true
      }));
    } catch (error) {
      logger.error('Failed to search games:', error);
      throw new Error(`Failed to search games: ${error}`);
    }
  }

  async getCurrentGame(channelId: string): Promise<EnrichedGame | null> {
    try {
      const channel = await this.apiClient.getChannel(channelId);
      if (!channel || !channel.game_id) return null;

      return this.getGameById(channel.game_id);
    } catch (error) {
      logger.error(`Failed to fetch current game for channel ${channelId}:`, error);
      throw new Error(`Failed to fetch current game: ${error}`);
    }
  }

  async getTopStreams(filters: StreamFilters = {}): Promise<any[]> {
    try {
      return await this.apiClient.getTopStreams(filters);
    } catch (error) {
      logger.error('Failed to fetch top streams:', error);
      throw new Error(`Failed to fetch top streams: ${error}`);
    }
  }

  async getChannelInfo(username: string): Promise<EnrichedChannel | null> {
    try {
      const user = await this.apiClient.getUser(username);
      if (!user) return null;

      const currentGame = await this.getCurrentGame(user.id);
      const followerCount = await this.getChannelFollowers(user.id);

      return {
        ...user,
        twitch_id: user.id,
        username: user.login,
        current_game: currentGame ? {
          id: currentGame.id,
          name: currentGame.name,
          box_art_url: currentGame.box_art_url
        } : undefined,
        is_live: !!currentGame,
        follower_count: followerCount,
        tags: []
      };
    } catch (error) {
      logger.error(`Failed to fetch channel info for ${username}:`, error);
      throw new Error(`Failed to fetch channel info: ${error}`);
    }
  }
}

export const twitchService = TwitchService.getInstance();
export default twitchService;

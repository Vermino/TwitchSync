// Filepath: backend/src/services/twitch/api-client.ts

import { logger } from '../../utils/logger';
import { TwitchBaseClient } from './base-client';
import {
  TwitchVOD,
  TwitchGame,
  TwitchChannel,
  StreamFilters,
  TwitchAPIResponse,
  PlaylistData,
  TwitchStreamInfo,
  TwitchScheduleResponse,
  TwitchScheduleSegment
} from './types';
import axios from "axios";

const MAX_VODS = 10; // Add constant for VOD limit

export class TwitchAPIClient extends TwitchBaseClient {
  private static instance: TwitchAPIClient;

  private constructor() {
    super();
  }

  public static getInstance(): TwitchAPIClient {
    if (!TwitchAPIClient.instance) {
      TwitchAPIClient.instance = new TwitchAPIClient();
    }
    return TwitchAPIClient.instance;
  }

  async searchChannels(query: string): Promise<TwitchChannel[]> {
    try {
      const response = await this.makeRequest<TwitchStreamInfo>('/search/channels', {
        query,
        first: '20'
      });

      return response.data.map((channel: TwitchStreamInfo) => ({
        id: channel.user_id,
        login: channel.user_login,
        display_name: channel.user_name,
        profile_image_url: channel.thumbnail_url,
        offline_image_url: '',
        description: channel.title,
        view_count: channel.viewer_count,
        broadcaster_type: ''
      }));
    } catch (error) {
      logger.error('Failed to search channels:', error);
      throw error;
    }
  }

  async getFollowerCount(channelId: string): Promise<number> {
    try {
      const response = await this.makeRequest<{ total: number }>('/channels/followers', {
        broadcaster_id: channelId
      });
      return response.data[0]?.total || 0;
    } catch (error) {
      logger.error(`Failed to get follower count for channel ${channelId}:`, error);
      return 0;
    }
  }

  async getUser(username: string): Promise<TwitchChannel | null> {
    try {
      const response = await this.makeRequest<TwitchChannel>('/users', { login: username });
      return response.data[0] || null;
    } catch (error) {
      logger.error(`Failed to get user info for ${username}:`, error);
      throw error;
    }
  }

  async getChannel(channelId: string): Promise<TwitchStreamInfo | null> {
    try {
      const response = await this.makeRequest<TwitchStreamInfo>('/streams', {
        user_id: channelId
      });
      return response.data[0] || null;
    } catch (error) {
      logger.error(`Failed to get channel info for ${channelId}:`, error);
      throw error;
    }
  }

  async getVODInfo(vodId: string): Promise<TwitchVOD | null> {
    try {
      // Remove any potential prefixes or special characters
      const cleanVodId = vodId.replace(/[^\d]/g, '');

      logger.debug(`Fetching VOD info for ID: ${cleanVodId}`);

      const response = await this.makeRequest<TwitchVOD>('/videos', {
        id: cleanVodId
      });

      if (!response.data || response.data.length === 0) {
        logger.warn(`No VOD found for ID ${cleanVodId}`);
        return null;
      }

      const vod = response.data[0];

      // Validate required fields
      if (!vod.id || !vod.user_id) {
        logger.warn(`Invalid VOD data received for ID ${cleanVodId}:`, vod);
        return null;
      }

      return vod;
    } catch (error) {
      // Special handling for 404s (VOD not found)
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.warn(`VOD ${vodId} not found`);
        return null;
      }

      // For other errors
      logger.error(`Failed to get VOD info for ${vodId}:`, error);
      throw new Error(`Failed to fetch VOD info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getVODs(userId: string, first: number = MAX_VODS): Promise<TwitchVOD[]> {
    try {
      logger.debug(`Fetching VODs for user ${userId} with limit ${first}`);
      const response = await this.makeRequest<TwitchVOD>('/videos', {
        user_id: userId,
        first: Math.min(first, MAX_VODS).toString(), // Ensure we never request more than MAX_VODS
        type: 'all'
      });

      const filteredVods = response.data.filter((vod: TwitchVOD) =>
        vod.viewable === 'public' &&
        ['archive', 'highlight', 'upload'].includes(vod.type)
      );

      logger.info(`Found ${filteredVods.length} downloadable VODs for channel ${userId}`);
      return filteredVods.slice(0, MAX_VODS); // Double ensure we don't exceed the limit
    } catch (error) {
      logger.error(`Failed to get VODs for user ${userId}:`, error);
      throw error;
    }
  }

  async getVODPlaylist(vodId: string, quality?: string): Promise<PlaylistData | null> {
    try {
      const cleanVodId = vodId.replace(/[^\d]/g, '');
      const response = await this.makeRequest<any>(`/videos/${cleanVodId}/playlist`);

      if (!response.data) {
        return null;
      }

      const playlistData: PlaylistData = {
        qualities: {},
        duration: 0
      };

      // Parse the playlist data
      if (Array.isArray(response.data)) {
        const firstPlaylist = response.data[0];
        if (firstPlaylist?.qualities) {
          firstPlaylist.qualities.forEach((quality: any) => {
            if (quality.name && Array.isArray(quality.segments)) {
              playlistData.qualities[quality.name] = {
                segments: quality.segments.map((segment: any) => ({
                  url: segment.url || '',
                  duration: parseFloat(segment.duration) || 0
                }))
              };
            }
          });

          // Calculate total duration from first quality
          const firstQuality = Object.values(playlistData.qualities)[0];
          if (firstQuality) {
            playlistData.duration = firstQuality.segments.reduce(
              (sum, segment) => sum + segment.duration,
              0
            );
          }
        }
      }

      if (quality && playlistData.qualities[quality]) {
        return {
          qualities: { [quality]: playlistData.qualities[quality] },
          duration: playlistData.duration
        };
      }

      return playlistData;
    } catch (error) {
      logger.error(`Failed to get VOD playlist for ${vodId}:`, error);
      return null;
    }
  }

  async getGame(gameId: string): Promise<TwitchGame | null> {
    try {
      const response = await this.makeRequest<TwitchGame>('/games', { id: gameId });
      const game = response.data[0];
      if (game) {
        game.box_art_url = this.formatBoxArtUrl(game.box_art_url);
      }
      return game || null;
    } catch (error) {
      logger.error(`Failed to get game info for ${gameId}:`, error);
      throw error;
    }
  }

  async searchGames(query: string): Promise<TwitchGame[]> {
    try {
      const response = await this.makeRequest<TwitchGame>('/search/categories', {
        query,
        first: '20'
      });

      return response.data.map((game: TwitchGame) => ({
        ...game,
        box_art_url: this.formatBoxArtUrl(game.box_art_url)
      }));
    } catch (error) {
      logger.error('Failed to search games:', error);
      throw error;
    }
  }

  async getTopStreams(filters: StreamFilters): Promise<TwitchStreamInfo[]> {
    const params: Record<string, string | number> = {
      first: filters.limit?.toString() || '100'
    };

    if (filters.languages?.length) {
      params.language = filters.languages.join(',');
    }

    if (filters.gameId) {
      params.game_id = filters.gameId;
    }

    try {
      const response = await this.makeRequest<TwitchStreamInfo>('/streams', params);
      return response.data;
    } catch (error) {
      logger.error('Failed to get top streams:', error);
      throw error;
    }
  }

  async getChannelSchedule(channelId: string): Promise<TwitchScheduleSegment[]> {
    try {
      const response = await this.makeRequest<TwitchScheduleResponse>('/schedule', {
        broadcaster_id: channelId
      });

      if (response.data && response.data.length > 0) {
        return response.data[0].segments || [];
      }
      return [];
    } catch (error) {
      logger.error(`Failed to get schedule for channel ${channelId}:`, error);
      return [];
    }
  }

  async getVODChapters(vodId: string): Promise<any[]> {
    try {
      const response = await this.makeRequest<any>(`/videos/${vodId}/chapters`);
      return response.data || [];
    } catch (error) {
      logger.error(`Failed to get chapters for VOD ${vodId}:`, error);
      return [];
    }
  }

  async getVODMutedSegments(vodId: string): Promise<any[]> {
    try {
      const response = await this.makeRequest<any>(`/videos/${vodId}/muted-segments`);
      return response.data || [];
    } catch (error) {
      logger.error(`Failed to get muted segments for VOD ${vodId}:`, error);
      return [];
    }
  }
}

export default TwitchAPIClient;

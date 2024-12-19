// Filepath: backend/src/services/twitch/api.ts

import axios, { AxiosResponse } from 'axios';
import { logger } from '../../utils/logger';
import { StreamFilters } from '../../types/discovery';
import {
  ChapterInfo,
  VODInfo,
  VODPlaylist,
  VODMarker,
  ChatMessage,
  VODQuality,
  VODSegment
} from '../../types/twitch';
import {QueryArrayResult, QueryResult} from "pg";

interface TwitchAPIResponse<T> {
  data: T[];
  pagination?: {
    cursor?: string;
  };
}

interface TwitchPlaylistResponse {
  data: {
    qualities: Array<{
      name: string;
      segments: Array<{
        url: string;
        duration: number;
      }>;
    }>;
  };
}

interface TwitchFollowerResponse {
  data: Array<{
    user_id: string;
    user_login: string;
    user_name: string;
    followed_at: string;
  }>;
  pagination: {
    cursor?: string;
  };
  total: number;
}

interface TwitchChannel {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
  offline_image_url: string;
  description: string;
  view_count: number;
  broadcaster_type: string;
  follower_count?: number;
}

interface TwitchSearchChannel {
  broadcaster_language: string;
  broadcaster_login: string;
  display_name: string;
  game_id: string;
  game_name: string;
  id: string;
  is_live: boolean;
  tags: string[];
  thumbnail_url: string;
  title: string;
}

interface TwitchChannelInfo {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  broadcaster_language: string;
  game_id: string;
  game_name: string;
  title: string;
  delay: number;
  tags: string[];
  follower_count: number;
  profile_image_url: string;
}

interface TwitchChannelFollowers {
  total: number;
  data: Array<{
    user_id: string;
    user_login: string;
    user_name: string;
    followed_at: string;
  }>;
  pagination: {
    cursor?: string;
  };
}

interface TwitchGame {
  id: string;
  name: string;
  box_art_url: string;
  igdb_id?: string;
  genres?: string[];
}

interface TwitchVOD {
  channel_id: string | string[];
  id: string;
  user_id: string;
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
  type: 'upload' | 'archive' | 'highlight';
  duration: string;
}

// Extended interface for our enriched game data
interface EnrichedTwitchGame extends TwitchGame {
  category?: string;
  tags?: string[];
  last_checked?: string;
  status?: string;
  is_active?: boolean;
  genres?: string[];
}

interface EnrichedChannel {
  id: string;
  twitch_id: string;
  username: string;
  display_name: string;
  description: string;
  profile_image_url: string;
  broadcaster_type: string;
  follower_count: number;
  view_count: number;
}

export class TwitchAPIService {
  private static instance: TwitchAPIService;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiration: number = 0;

  private constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID || '';
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET || '';

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Twitch API credentials not configured');
    }
  }

  public static getInstance(): TwitchAPIService {
    if (!TwitchAPIService.instance) {
      TwitchAPIService.instance = new TwitchAPIService();
    }
    return TwitchAPIService.instance;
  }

  private async refreshAccessToken(): Promise<string> {
    try {
      const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials'
        }
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiration = Date.now() + (response.data.expires_in * 1000) - 300000; // 5 minutes buffer

      if (!this.accessToken) {
        throw new Error('Failed to obtain access token from Twitch');
      }

      return this.accessToken;
    } catch (error) {
      logger.error('Failed to refresh Twitch access token:', error);
      throw new Error('Failed to obtain Twitch access token');
    }
  }

  private async getAccessToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiration) {
      return this.refreshAccessToken();
    }
    return this.accessToken;
  }

  private formatBoxArtUrl(url: string | null | undefined): string {
    if (!url) {
      return `/api/placeholder/285/380`;
    }

    // Convert any sized URL to base IGDB.jpg format
    if (url.includes('-')) {
      return url.replace(/-\d+x\d+\.jpg$/, '-IGDB.jpg');
    }

    // Handle template URLs
    if (url.includes('{width}') && url.includes('{height}')) {
      return url.replace('{width}x{height}', 'IGDB');
    }

    return url;
  }

  async searchChannels(query: string): Promise<EnrichedChannel[]> {
    try {
      // First get basic channel info
      const searchResponse = await axios.get<TwitchAPIResponse<TwitchSearchChannel>>(
        'https://api.twitch.tv/helix/search/channels',
        {
          headers: {
            'Authorization': `Bearer ${await this.getAccessToken()}`,
            'Client-Id': this.clientId
          },
          params: {
            query,
            first: '20'
          }
        }
      );

      // Get channel details including follower count for each result
      const enrichedChannels = await Promise.all(
        searchResponse.data.data.map(async (channel) => {
          try {
            // Get follower count
            const followerResponse = await axios.get<TwitchChannelFollowers>(
              `https://api.twitch.tv/helix/channels/followers`,
              {
                headers: {
                  'Authorization': `Bearer ${await this.getAccessToken()}`,
                  'Client-Id': this.clientId
                },
                params: {
                  broadcaster_id: channel.id
                }
              }
            );

            // Get channel info including profile image
            const channelResponse = await axios.get<TwitchAPIResponse<any>>(
              `https://api.twitch.tv/helix/users`,
              {
                headers: {
                  'Authorization': `Bearer ${await this.getAccessToken()}`,
                  'Client-Id': this.clientId
                },
                params: {
                  id: channel.id
                }
              }
            );

            const followerCount = followerResponse.data.total;
            const profileData = channelResponse.data.data[0] || {};

            return {
              id: channel.id,
              twitch_id: channel.id,
              username: channel.broadcaster_login,
              display_name: channel.display_name,
              description: profileData.description || '',
              profile_image_url: profileData.profile_image_url || channel.thumbnail_url,
              broadcaster_type: profileData.broadcaster_type || '',
              follower_count: followerCount || 0,
              view_count: profileData.view_count || 0
            };
          } catch (error) {
            logger.error(`Error enriching channel data for ${channel.broadcaster_login}:`, error);
            // Return basic info if enrichment fails
            return {
              id: channel.id,
              twitch_id: channel.id,
              username: channel.broadcaster_login,
              display_name: channel.display_name,
              description: '',
              profile_image_url: channel.thumbnail_url,
              broadcaster_type: '',
              follower_count: 0,
              view_count: 0
            };
          }
        })
      );

      // Sort by follower count
      return enrichedChannels.sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0));
    } catch (error) {
      logger.error('Error searching channels:', error);
      throw error;
    }
  }

  async getChannelFollowers(channelId: string): Promise<number> {
    try {
      const response = await axios.get<TwitchChannelFollowers>(
        'https://api.twitch.tv/helix/channels/followers',
        {
          headers: {
            'Authorization': `Bearer ${await this.getAccessToken()}`,
            'Client-Id': this.clientId
          },
          params: {
            broadcaster_id: channelId
          }
        }
      );

      return response.data.total;
    } catch (error) {
      logger.error(`Error fetching followers for channel ${channelId}:`, error);
      return 0;
    }
  }

  // Make the makeRequest method more specific for different response types
  private async makeRequest<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<TwitchAPIResponse<T>> {
    try {
      const token = await this.getAccessToken();
      const response = await axios.get<TwitchAPIResponse<T>>(`https://api.twitch.tv/helix${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-Id': this.clientId
        },
        params
      });
      return response.data;
    } catch (error) {
      logger.error(`Twitch API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  async searchGames(query: string): Promise<TwitchGame[]> {
    try {
      const searchResponse = await this.makeRequest<TwitchGame>('/search/categories', {
        query,
        first: '20'
      });

      const enrichedGames = await Promise.all(
          searchResponse.data.map(async (game) => {
            try {
              const gameResponse = await this.makeRequest<TwitchGame>('/games', {
                id: game.id
              });

              const gameData = gameResponse.data[0] || game;

              // Store original IGDB format URL
              const baseBoxArtUrl = this.formatBoxArtUrl(gameData.box_art_url || game.box_art_url);

              return {
                ...gameData,
                box_art_url: baseBoxArtUrl,
                category: gameData.name.split(' ')[0].toLowerCase(),
                tags: [],
                last_checked: new Date().toISOString(),
                status: 'active',
                is_active: true
              };
            } catch (error) {
              logger.error(`Failed to get details for game ${game.name}:`, error);
              return {
                ...game,
                box_art_url: this.formatBoxArtUrl(game.box_art_url),
                category: game.name.split(' ')[0].toLowerCase(),
                tags: [],
                last_checked: new Date().toISOString(),
                status: 'active',
                is_active: true
              };
            }
          })
      );

      return enrichedGames;
    } catch (error) {
      logger.error('Error searching games:', error);
      throw error;
    }
  }

  async getTopStreams(filters: StreamFilters): Promise<any[]> {
    const params: Record<string, string | number> = {
      first: filters.limit?.toString() || '100'
    };

    if (filters.languages?.length) {
      params.language = filters.languages.join(',');
    }

    if (filters.gameId) {
      params.game_id = filters.gameId;
    }

    const response = await this.makeRequest<any>('/streams', params);
    return response.data;
  }

  async getCurrentGame(channelId: string): Promise<EnrichedTwitchGame | null> {
    try {
      const response = await this.makeRequest<any>('/streams', {user_id: channelId});
      if (response.data.length === 0) {
        return null;
      }

      const stream = response.data[0];
      const gameResponse = await this.makeRequest<TwitchGame>('/games', {id: stream.game_id});

      if (gameResponse.data.length === 0) {
        return null;
      }

      const gameData = gameResponse.data[0];
      const enrichedGame: EnrichedTwitchGame = {
        ...gameData,
        box_art_url: this.formatBoxArtUrl(gameData.box_art_url),
        category: gameData.name.split(' ')[0].toLowerCase(),
        tags: [],
        last_checked: new Date().toISOString(),
        status: 'active',
        is_active: true
      };

      return enrichedGame;
    } catch (error) {
      logger.error('Failed to get current game:', error);
      return null;
    }
  }

  async getGameById(gameId: string): Promise<EnrichedTwitchGame | null> {
    try {
      const response = await this.makeRequest<TwitchGame>('/games', {id: gameId});

      if (response.data.length === 0) {
        return null;
      }

      const gameData = response.data[0];
      const enrichedGame: EnrichedTwitchGame = {
        ...gameData,
        box_art_url: this.formatBoxArtUrl(gameData.box_art_url),
        category: gameData.name.split(' ')[0].toLowerCase(),
        tags: [],
        last_checked: new Date().toISOString(),
        status: 'active',
        is_active: true
      };

      return enrichedGame;
    } catch (error) {
      logger.error(`Failed to get game by ID ${gameId}:`, error);
      return null;
    }
  }

  async getVODInfo(vodId: string): Promise<any> {
    try {
      const response = await this.makeRequest<any>(`/videos/${vodId}`);
      return response.data[0];
    } catch (error) {
      logger.error(`Failed to get VOD info for ${vodId}:`, error);
      throw error;
    }
  }

  async getVODPlaylist(vodId: string, quality?: string): Promise<{
    qualities: Record<string, { segments: { url: string; duration: number; }[] }>;
    duration: number;
  } | null> {
    try {
      const response = await this.makeRequest<TwitchPlaylistResponse>(`/videos/${vodId}/playlist`);

      // Transform the raw response into the expected format
      const playlistData = {
        qualities: {} as Record<string, { segments: { url: string; duration: number; }[] }>,
        duration: 0
      };

      if (response.data && Array.isArray(response.data)) {
        // Handle the case where response.data is an array
        const playlistResponse = response.data[0] as any;

        if (playlistResponse && Array.isArray(playlistResponse.qualities)) {
          let totalDuration = 0;

          // Transform qualities data
          playlistResponse.qualities.forEach((quality: any) => {
            if (quality.name && Array.isArray(quality.segments)) {
              playlistData.qualities[quality.name] = {
                segments: quality.segments.map((segment: any) => ({
                  url: segment.url || '',
                  duration: parseFloat(segment.duration) || 0
                }))
              };

              // Update total duration based on the first quality's segments
              if (totalDuration === 0) {
                totalDuration = playlistData.qualities[quality.name].segments.reduce(
                    (sum: number, segment: { duration: number }) => sum + segment.duration,
                    0
                );
              }
            }
          });

          playlistData.duration = totalDuration;

          // If specific quality is requested, filter to only that quality
          if (quality && playlistData.qualities[quality]) {
            return {
              qualities: {[quality]: playlistData.qualities[quality]},
              duration: playlistData.duration
            };
          }

          return playlistData;
        }
      }

      logger.error(`Invalid playlist data format for VOD ${vodId}`);
      return null;
    } catch (error) {
      logger.error(`Failed to get VOD playlist for ${vodId}:`, error);
      return null;
    }
  }

  async getVODChat(vodId: string): Promise<any[]> {
    try {
      const response = await this.makeRequest<any>(`/videos/${vodId}/chat`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get VOD chat for ${vodId}:`, error);
      throw error;
    }
  }

  async getVODMarkers(vodId: string): Promise<any[]> {
    try {
      const response = await this.makeRequest<any>(`/videos/${vodId}/markers`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get VOD markers for ${vodId}:`, error);
      throw error;
    }
  }

  async getVODChapters(vodId: string): Promise<ChapterInfo[]> {
    try {
      const response = await this.makeRequest<any>(`/videos/${vodId}/chapters`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get VOD chapters for ${vodId}:`, error);
      throw error;
    }
  }

  async getChannelVODs(twitch_id: string): Promise<TwitchVOD[]> {
    try {
      const response = await this.makeRequest<TwitchVOD>('/videos', {
        user_id: twitch_id,
        first: '100',
        type: 'all'
      });

      if (!response.data) {
        logger.warn(`No VODs found for channel ${twitch_id}`);
        return [];
      }

      // Filter out any non-downloadable VODs and enrich with additional data
      const downloadableVODs = response.data.filter(vod =>
          vod.viewable === 'public' &&
          ['archive', 'highlight', 'upload'].includes(vod.type)
      );

      logger.info(`Found ${downloadableVODs.length} downloadable VODs for channel ${twitch_id}`);
      return downloadableVODs;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Error fetching VODs for channel ${twitch_id}:`, error);
        throw new Error(`Failed to fetch VODs for channel: ${error.message}`);
      } else {
        logger.error(`Unknown error fetching VODs for channel ${twitch_id}:`, error);
        throw new Error('Failed to fetch VODs for channel due to an unknown error.');
      }
    }
  }


  async getGameVODs(twitch_game_id: string): Promise<TwitchVOD[]> {
    try {
      const streamsResponse = await this.makeRequest<any>('/streams', {
        game_id: twitch_game_id,
        first: '100'
      });

      if (!streamsResponse.data || streamsResponse.data.length === 0) {
        logger.warn(`No active streams found for game ${twitch_game_id}`);
        return [];
      }

      const channelIds = [...new Set(streamsResponse.data.map(stream => stream.user_id))];
      const vods: TwitchVOD[] = [];
      for (const channelId of channelIds) {
        try {
          const channelVods = await this.getChannelVODs(channelId);
          const gameVods = channelVods.filter(vod =>
              vod.type === 'archive' && vod.viewable === 'public'
          );
          vods.push(...gameVods);
        } catch (error) {
          if (error instanceof Error) {
            logger.error(`Error fetching VODs for channel ${channelId} in game ${twitch_game_id}:`, error);
          } else {
            logger.error(`Unknown error fetching VODs for channel ${channelId} in game ${twitch_game_id}:`, error);
          }
          continue;
        }
      }

      logger.info(`Found ${vods.length} total VODs for game ${twitch_game_id}`);
      return vods;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Error fetching VODs for game ${twitch_game_id}:`, error);
        throw new Error(`Failed to fetch game VODs: ${error.message}`);
      } else {
        logger.error(`Unknown error fetching VODs for game ${twitch_game_id}:`, error);
        throw new Error('Failed to fetch game VODs due to an unknown error.');
      }
    }
  }
}

export const twitchAPI = TwitchAPIService.getInstance();

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

const MAX_VODS = 50; // Increased to fetch more VOD history for better game matching

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
      const response = await this.makeRequest<{ total: number, data: any[] }>('/channels/followers', {
        broadcaster_id: channelId
      });
      logger.info(`Follower count response for ${channelId}:`, { total: response.total, hasData: !!response.data });
      return response.total || 0;
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
      logger.debug(`Getting VOD playlist for ID: ${cleanVodId}`);

      // Step 1: Get access token from Twitch API
      const tokenResponse = await this.getVODAccessToken(cleanVodId);
      if (!tokenResponse) {
        throw new Error('Failed to get access token');
      }

      // Step 2: Get M3U8 playlist from Usher API
      const m3u8Response = await this.getUsherPlaylist(cleanVodId, tokenResponse.token, tokenResponse.sig);
      if (!m3u8Response) {
        throw new Error('Failed to get M3U8 playlist');
      }

      // Step 3: Parse M3U8 content
      const playlistData = await this.parseM3U8Playlist(m3u8Response.content, m3u8Response.baseUrl);
      if (!playlistData) {
        throw new Error('Failed to parse M3U8 playlist');
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

  private async getVODAccessToken(vodId: string): Promise<{ token: string; sig: string } | null> {
    try {
      // Use Twitch's GQL endpoint like TwitchLeecher-DX
      const gqlUrl = 'https://gql.twitch.tv/gql';
      const gqlQuery = `
        query PlaybackAccessToken($vodID: ID!, $playerType: String!) {
          videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) {
            value
            signature
            __typename
          }
        }`;

      logger.debug(`Getting access token for VOD ${vodId} using GQL`);
      
      const response = await axios.post(gqlUrl, {
        query: gqlQuery,
        variables: {
          vodID: vodId,
          playerType: "embed"
        }
      }, {
        headers: {
          'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', // Standard web client ID used by TwitchLeecher
          'Content-Type': 'application/json'
        }
      });

      const tokenData = response.data?.data?.videoPlaybackAccessToken;
      if (tokenData && tokenData.value && tokenData.signature) {
        logger.debug(`Got GQL access token for VOD ${vodId}`);
        return {
          token: tokenData.value,
          sig: tokenData.signature
        };
      }

      // Fallback to legacy API if GQL fails
      logger.warn(`GQL token fetch failed for VOD ${vodId}, trying legacy API`);
      const legacyUrl = `https://api.twitch.tv/api/vods/${vodId}/access_token`;
      const legacyResponse = await axios.get(legacyUrl, {
        params: {
          client_id: this.clientId
        },
        headers: {
          'Client-ID': this.clientId
        }
      });

      if (legacyResponse.data && legacyResponse.data.token && legacyResponse.data.sig) {
        logger.debug(`Got legacy access token for VOD ${vodId}`);
        return {
          token: legacyResponse.data.token,
          sig: legacyResponse.data.sig
        };
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get access token for VOD ${vodId}:`, error);
      return null;
    }
  }

  private async getUsherPlaylist(vodId: string, token: string, sig: string): Promise<{ content: string; baseUrl: string } | null> {
    try {
      const randomParam = Math.floor(Math.random() * 99999) + 1;
      const url = `https://usher.ttvnw.net/vod/${vodId}`;
      
      const response = await axios.get(url, {
        params: {
          player: 'twitchweb',
          nauth: token,
          nauthsig: sig,
          allow_audio_only: 'true',
          allow_source: 'true',
          type: 'any',
          p: randomParam
        },
        headers: {
          'Client-ID': this.clientId
        }
      });

      if (response.data && typeof response.data === 'string') {
        logger.debug(`Got M3U8 playlist for VOD ${vodId}, length: ${response.data.length}`);
        return {
          content: response.data,
          baseUrl: response.config.url || url
        };
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get Usher playlist for VOD ${vodId}:`, error);
      return null;
    }
  }

  private async parseM3U8Playlist(m3u8Content: string, baseUrl?: string): Promise<PlaylistData | null> {
    try {
      const lines = m3u8Content.split('\n').map(line => line.trim()).filter(line => line);
      const playlistData: PlaylistData = {
        qualities: {},
        duration: 0
      };

      let currentQuality: string | null = null;
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];

        // Look for stream info lines
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const streamInfo = line;
          const streamUrl = lines[i + 1];
          
          if (streamUrl && !streamUrl.startsWith('#')) {
            // Extract quality information
            const resolutionMatch = streamInfo.match(/RESOLUTION=(\d+x\d+)/);
            const nameMatch = streamInfo.match(/VIDEO="([^"]+)"/);
            const fpsMatch = streamInfo.match(/FRAME-RATE=([\d.]+)/);
            
            let qualityName = 'unknown';
            if (nameMatch && nameMatch[1]) {
              qualityName = nameMatch[1];
            } else if (resolutionMatch && resolutionMatch[1]) {
              const resolution = resolutionMatch[1];
              // Map common resolutions to quality names
              const qualityMap: Record<string, string> = {
                '1920x1080': 'source',
                '1280x720': '720p60',
                '852x480': '480p',
                '640x360': '360p',
                '426x240': '160p'
              };
              qualityName = qualityMap[resolution] || resolution;
            }

            // Get the individual stream playlist
            const streamPlaylist = await this.getStreamPlaylist(streamUrl);
            if (streamPlaylist) {
              playlistData.qualities[qualityName] = streamPlaylist;
              
              // Use the first quality to calculate total duration
              if (playlistData.duration === 0) {
                playlistData.duration = streamPlaylist.segments.reduce(
                  (sum, segment) => sum + segment.duration, 0
                );
              }
            }
          }
          i += 2; // Skip the URL line
        } else {
          i++;
        }
      }

      // If no stream-inf found, try parsing as a direct playlist
      if (Object.keys(playlistData.qualities).length === 0) {
        const directPlaylist = this.parseDirectPlaylist(m3u8Content, baseUrl);
        if (directPlaylist) {
          playlistData.qualities['source'] = directPlaylist;
          playlistData.duration = directPlaylist.segments.reduce(
            (sum, segment) => sum + segment.duration, 0
          );
        }
      }

      logger.debug(`Parsed M3U8 playlist with ${Object.keys(playlistData.qualities).length} qualities`);
      return playlistData;
    } catch (error) {
      logger.error('Failed to parse M3U8 playlist:', error);
      return null;
    }
  }

  private async getStreamPlaylist(streamUrl: string): Promise<{ segments: Array<{ url: string; duration: number }> } | null> {
    try {
      const response = await axios.get(streamUrl);
      if (response.data && typeof response.data === 'string') {
        return this.parseDirectPlaylist(response.data, streamUrl);
      }
      return null;
    } catch (error) {
      logger.error(`Failed to get stream playlist from ${streamUrl}:`, error);
      return null;
    }
  }

  private parseDirectPlaylist(content: string, baseUrl?: string): { segments: Array<{ url: string; duration: number }> } | null {
    try {
      const lines = content.split('\n').map(line => line.trim()).filter(line => line);
      const segments: Array<{ url: string; duration: number }> = [];
      
      let currentDuration = 0;
      
      // Helper function to resolve relative URLs
      const resolveUrl = (url: string): string => {
        if (!baseUrl || url.startsWith('http://') || url.startsWith('https://')) {
          return url;
        }
        
        try {
          // Create URL object from baseUrl and resolve the relative path
          const base = new URL(baseUrl);
          return new URL(url, base).toString();
        } catch (error) {
          logger.warn(`Failed to resolve relative URL "${url}" against base "${baseUrl}":`, error);
          return url; // Return original if resolution fails
        }
      };
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('#EXTINF:')) {
          const durationMatch = line.match(/#EXTINF:([\d.]+)/);
          if (durationMatch) {
            currentDuration = parseFloat(durationMatch[1]);
          }
        } else if (line.startsWith('#EXT-X-TWITCH-PREFETCH:')) {
          // Handle Twitch prefetch segments
          const url = line.replace('#EXT-X-TWITCH-PREFETCH:', '');
          if (url && currentDuration > 0) {
            segments.push({
              url: resolveUrl(url.trim()),
              duration: currentDuration
            });
          }
        } else if (!line.startsWith('#') && line.includes('.ts')) {
          // Regular segment URL
          if (currentDuration > 0) {
            segments.push({
              url: resolveUrl(line),
              duration: currentDuration
            });
            currentDuration = 0; // Reset for next segment
          }
        }
      }
      
      return segments.length > 0 ? { segments } : null;
    } catch (error) {
      logger.error('Failed to parse direct playlist:', error);
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

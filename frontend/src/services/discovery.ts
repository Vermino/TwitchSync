// frontend/src/services/discovery.ts

import axios from 'axios';
import type {
  ChannelRecommendation,
  GameRecommendation,
  FilterSettings,
  DiscoveryFeedResponse,
  DiscoveryStats,
  StreamPremiereEvent,
  RisingChannel,
  TrendingCategory
} from '@/types/discovery';

class DiscoveryService {
  async getChannelRecommendations(_filters?: FilterSettings): Promise<ChannelRecommendation[]> {
    try {
      // For development, return mock data
      // In production, this would make actual API calls
      return this.getMockChannelRecommendations();
    } catch (error) {
      console.error('Error getting channel recommendations:', error);
      return [];
    }
  }

  async getGameRecommendations(_filters?: FilterSettings): Promise<GameRecommendation[]> {
    try {
      // For development, return mock data
      // In production, this would make actual API calls
      return this.getMockGameRecommendations();
    } catch (error) {
      console.error('Error getting game recommendations:', error);
      return [];
    }
  }

  async getDiscoveryFeed(): Promise<DiscoveryFeedResponse> {
    try {
      // For development, return mock feed
      // In production, this would make actual API calls
      return {
        preferences: {
          minViewers: 100,
          maxViewers: 50000,
          preferredLanguages: ['EN'],
          contentRating: 'all',
          notifyOnly: false,
          scheduleMatch: true,
          confidenceThreshold: 0.7
        },
        premieres: [],
        risingChannels: [],
        recommendations: {
          channels: await this.getMockChannelRecommendations(),
          games: await this.getMockGameRecommendations()
        },
        trending: [],
        stats: await this.getDiscoveryStats()
      };
    } catch (error) {
      console.error('Error getting discovery feed:', error);
      // Return empty/default response
      return {
        preferences: {
          minViewers: 100,
          maxViewers: 50000,
          preferredLanguages: ['EN'],
          contentRating: 'all',
          notifyOnly: false,
          scheduleMatch: true,
          confidenceThreshold: 0.7
        },
        premieres: [],
        risingChannels: [],
        recommendations: {
          channels: [],
          games: []
        },
        trending: [],
        stats: {
          upcomingPremieres: 0,
          trackedPremieres: 0,
          risingChannels: 0,
          pendingArchives: 0,
          todayDiscovered: 0
        }
      };
    }
  }

  async getDiscoveryStats(): Promise<DiscoveryStats> {
    try {
      // For development, return mock stats
      // In production, this would make actual API calls
      return {
        upcomingPremieres: 8,
        trackedPremieres: 3,
        risingChannels: 12,
        pendingArchives: 5,
        todayDiscovered: 6
      };
    } catch (error) {
      console.error('Error getting discovery stats:', error);
      return {
        upcomingPremieres: 0,
        trackedPremieres: 0,
        risingChannels: 0,
        pendingArchives: 0,
        todayDiscovered: 0
      };
    }
  }

  async getPremieres(): Promise<StreamPremiereEvent[]> {
    try {
      // For development, return mock data
      // In production, this would make actual API calls
      return [];
    } catch (error) {
      console.error('Error getting premieres:', error);
      return [];
    }
  }

  async getRisingChannels(): Promise<RisingChannel[]> {
    try {
      // For development, return mock data
      // In production, this would make actual API calls
      return [];
    } catch (error) {
      console.error('Error getting rising channels:', error);
      return [];
    }
  }

  async getTrendingCategories(): Promise<TrendingCategory[]> {
    try {
      // For development, return mock data
      // In production, this would make actual API calls
      return [];
    } catch (error) {
      console.error('Error getting trending categories:', error);
      return [];
    }
  }

  async trackChannel(channelName: string, options: {
    quality: string;
    notifications: boolean;
    autoArchive: boolean;
  }) {
    try {
      // For development, simulate success
      // In production, this would create actual tasks via API
      console.log('Tracking channel:', channelName, options);

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));

      return { success: true, taskId: `channel-${Date.now()}` };
    } catch (error) {
      console.error('Error tracking channel:', error);
      throw error;
    }
  }

  async trackGame(gameName: string, options: {
    notifications: boolean;
    autoArchive: boolean;
  }) {
    try {
      // For development, simulate success
      // In production, this would create actual tasks via API
      console.log('Tracking game:', gameName, options);

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));

      return { success: true, taskId: `game-${Date.now()}` };
    } catch (error) {
      console.error('Error tracking game:', error);
      throw error;
    }
  }

  async ignoreChannel(channelId: string): Promise<void> {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(
        '/api/discovery/channels/ignore',
        { channel_id: channelId },
        { headers: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' } }
      );
    } catch (error) {
      console.error('Error ignoring channel:', error);
      throw error;
    }
  }

  async ignoreGame(gameId: string): Promise<void> {
    try {
      const token = localStorage.getItem('auth_token');
      await axios.post(
        '/api/discovery/games/ignore',
        { game_id: gameId },
        { headers: { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' } }
      );
    } catch (error) {
      console.error('Error ignoring game:', error);
      throw error;
    }
  }

  // Mock data methods for development
  private getMockChannelRecommendations(): ChannelRecommendation[] {
    return [
      {
        id: 'channel-1',
        type: 'channel',
        score: 0.92,
        reasons: [
          { type: 'GAME_OVERLAP', strength: 0.9 },
          { type: 'VIEWER_OVERLAP', strength: 0.8 }
        ],
        metrics: {
          viewerGrowth: 15.2,
          engagement: 8.5,
          streamHours: 120,
          followers: 45000,
          averageViewers: 2800
        },
        channel: {
          id: 'channel-1',
          name: 'xQcOW',
          avatar: 'https://static-cdn.jtvnw.net/jtv_user_pictures/xqcow-profile_image-9298dca608632101-300x300.jpeg',
          followers: 45000,
          averageViewers: 2800,
          currentGame: 'Just Chatting',
          language: 'EN'
        }
      },
      {
        id: 'channel-2',
        type: 'channel',
        score: 0.85,
        reasons: [
          { type: 'SCHEDULE_MATCH', strength: 0.9 },
          { type: 'GAME_OVERLAP', strength: 0.7 }
        ],
        metrics: {
          viewerGrowth: 8.3,
          engagement: 9.2,
          streamHours: 95,
          followers: 32000,
          averageViewers: 1900
        },
        channel: {
          id: 'channel-2',
          name: 'shroud',
          avatar: 'https://static-cdn.jtvnw.net/jtv_user_pictures/shroud-profile_image-7ecf97b8b9bc61ba-300x300.png',
          followers: 32000,
          averageViewers: 1900,
          currentGame: 'VALORANT',
          language: 'EN'
        }
      },
      {
        id: 'channel-3',
        type: 'channel',
        score: 0.78,
        reasons: [
          { type: 'VIEWER_OVERLAP', strength: 0.8 },
          { type: 'GAME_OVERLAP', strength: 0.6 }
        ],
        metrics: {
          viewerGrowth: 12.7,
          engagement: 7.8,
          streamHours: 88,
          followers: 28000,
          averageViewers: 1600
        },
        channel: {
          id: 'channel-3',
          name: 'pokimane',
          avatar: 'https://static-cdn.jtvnw.net/jtv_user_pictures/pokimane-profile_image-4de955d4b73049f0-300x300.png',
          followers: 28000,
          averageViewers: 1600,
          currentGame: 'League of Legends',
          language: 'EN'
        }
      }
    ];
  }

  private getMockGameRecommendations(): GameRecommendation[] {
    return [
      {
        id: 'game-1',
        type: 'game',
        score: 0.88,
        reasons: [
          { type: 'CHANNEL_OVERLAP', strength: 0.9 },
          { type: 'VIEWER_OVERLAP', strength: 0.7 }
        ],
        metrics: {
          activeChannels: 8500,
          totalViewers: 124000,
          averageViewers: 1200
        },
        game: {
          id: 'game-1',
          name: 'VALORANT',
          boxArt: 'https://static-cdn.jtvnw.net/ttv-boxart/516575-300x400.jpg',
          genres: ['Shooter', 'Competitive'],
          releaseDate: '2020-06-02'
        }
      },
      {
        id: 'game-2',
        type: 'game',
        score: 0.82,
        reasons: [
          { type: 'GENRE_MATCH', strength: 0.8 },
          { type: 'CHANNEL_OVERLAP', strength: 0.6 }
        ],
        metrics: {
          activeChannels: 12000,
          totalViewers: 95000,
          averageViewers: 950
        },
        game: {
          id: 'game-2',
          name: 'Apex Legends',
          boxArt: 'https://static-cdn.jtvnw.net/ttv-boxart/511224-300x400.jpg',
          genres: ['Battle Royale', 'Shooter'],
          releaseDate: '2019-02-04'
        }
      },
      {
        id: 'game-3',
        type: 'game',
        score: 0.75,
        reasons: [
          { type: 'VIEWER_OVERLAP', strength: 0.7 },
          { type: 'GENRE_MATCH', strength: 0.5 }
        ],
        metrics: {
          activeChannels: 6800,
          totalViewers: 87000,
          averageViewers: 1100
        },
        game: {
          id: 'game-3',
          name: 'Counter-Strike 2',
          boxArt: 'https://static-cdn.jtvnw.net/ttv-boxart/32399_IGDB-300x400.jpg',
          genres: ['Shooter', 'Competitive'],
          releaseDate: '2023-09-27'
        }
      }
    ];
  }
}

export const discoveryService = new DiscoveryService();
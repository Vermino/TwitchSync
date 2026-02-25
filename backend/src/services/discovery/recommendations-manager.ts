// Filepath: backend/src/services/discovery/recommendations-manager.ts

import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import { TwitchService } from '../twitch/service';
import {
  ChannelRecommendation,
  GameRecommendation,
  RecommendationReason,
  UserPreferences,
  ChannelReasonType,
  GameReasonType
} from '../../types/discovery';

export class RecommendationsManager {
  constructor(
    private pool: Pool,
    private twitchAPI: TwitchService
  ) { }

  async getChannelRecommendations(
    userId: string,
    userPrefs: UserPreferences
  ): Promise<ChannelRecommendation[]> {
    const client = await this.pool.connect();
    try {
      // Find all games in the global index
      const gamesResult = await client.query(`
        SELECT twitch_game_id FROM games WHERE is_active = true ORDER BY RANDOM() LIMIT 20
      `);
      const activeGames = gamesResult.rows.map(r => r.twitch_game_id);

      if (activeGames.length === 0) return [];

      // Fetch top VODs for these games. Limit to top 5 games per run to save rate limits
      const topGames = activeGames.slice(0, 5);
      let allVods: import('../twitch/types').TwitchVOD[] = [];

      await Promise.all(topGames.map(async (gameId) => {
        try {
          const vods = await this.twitchAPI.getTopVODs({
            gameId,
            period: 'month',
            sort: 'views',
            languages: userPrefs.preferred_languages,
            limit: 30
          });
          allVods.push(...vods);
        } catch (e) {
          logger.warn(`Failed to fetch VODs for game ${gameId}`);
        }
      }));

      // Filter out ignored and already indexed channels
      const filterDataResult = await client.query(`
        WITH ignored_channels AS (
          SELECT DISTINCT item_id 
          FROM ignored_discovery_items 
          WHERE user_id = $1 AND item_type = 'channel'
        )
        SELECT 
          ARRAY(SELECT twitch_id FROM channels WHERE is_active = true) as tracked,
          ARRAY(SELECT item_id FROM ignored_channels) as ignored
      `, [userId]);

      const tracked = new Set(filterDataResult.rows[0].tracked || []);
      const ignored = new Set(filterDataResult.rows[0].ignored || []);

      // Deduplicate broadcasters from VODs
      const uniqueBroadcasters = new Map<string, import('../twitch/types').TwitchVOD>();

      for (const vod of allVods) {
        if (tracked.has(vod.user_id) || ignored.has(vod.user_id)) continue;

        // Use userPrefs.min_viewers as minimum VOD Views constraint
        if (vod.view_count < userPrefs.min_viewers) continue;
        if (vod.view_count > userPrefs.max_viewers) continue;

        if (!uniqueBroadcasters.has(vod.user_id)) {
          uniqueBroadcasters.set(vod.user_id, vod);
        } else {
          // Keep the record with highest views for display context
          if (vod.view_count > uniqueBroadcasters.get(vod.user_id)!.view_count) {
            uniqueBroadcasters.set(vod.user_id, vod);
          }
        }
      }

      const rawRecommendations: ChannelRecommendation[] = Array.from(uniqueBroadcasters.values())
        .map(vod => ({
          type: 'channel' as const,
          id: vod.user_id,
          display_name: vod.user_name,
          login: vod.user_name.toLowerCase().replace(/\s+/g, ''),
          profile_image_url: '',
          description: `VOD Highlight: ${vod.title}`,
          viewer_count: vod.view_count, // Representing VOD Views
          compatibility_score: Math.min((vod.view_count / 100000), 1.0),
          recommendation_reasons: [{
            type: 'GAME_OVERLAP' as const,
            strength: 1.0
          }],
          tags: []
        }))
        .sort((a, b) => b.viewer_count - a.viewer_count)
        .slice(0, 20);

      if (rawRecommendations.length === 0) return [];

      // Enrich profile urls via Users batch endpoint
      try {
        const userIds = rawRecommendations.map(r => r.id);
        const usersRes = await this.twitchAPI.apiClient['makeRequest']<any>('/users', { id: userIds });
        const userObj = new Map(usersRes.data.map((u: any) => [u.id, u]));

        for (const rec of rawRecommendations) {
          const u = userObj.get(rec.id);
          if (u) {
            rec.login = u.login;
            rec.profile_image_url = u.profile_image_url;
          }
        }
      } catch (e) {
        logger.warn('Failed to enrich recommendation channels');
      }

      return rawRecommendations;
    } catch (error) {
      logger.error('Error getting channel recommendations:', error);
      return [];
    } finally {
      client.release();
    }
  }

  async getGameRecommendations(userId: string, activePrefs: import('../../types/discovery').UserPreferences): Promise<GameRecommendation[]> {
    const client = await this.pool.connect();
    try {
      // Find all channels heavily tracked by system index
      const channelsResult = await client.query(`
        SELECT twitch_id FROM channels WHERE is_active = true ORDER BY RANDOM() LIMIT 20
      `);
      const activeChannels = channelsResult.rows.map(r => r.twitch_id);

      if (activeChannels.length === 0) return [];

      // Fetch recent VODs created by these channels to extract games they've been playing
      const topChannels = activeChannels.slice(0, 5);
      let allVods: import('../twitch/types').TwitchVOD[] = [];

      await Promise.all(topChannels.map(async (userId) => {
        try {
          const vods = await this.twitchAPI.getTopVODs({
            userId,
            period: 'month',
            limit: 20
          });
          allVods.push(...vods);
        } catch (e) {
          logger.warn(`Failed to fetch VODs for channel ${userId}`);
        }
      }));

      // Map games found in VODs
      const uniqueGames = new Map<string, { view_count: number, occurrences: number }>();

      for (const vod of allVods) {
        if (!vod.game_id) continue;
        const entry = uniqueGames.get(vod.game_id) || { view_count: 0, occurrences: 0 };
        entry.view_count += vod.view_count;
        entry.occurrences += 1;
        uniqueGames.set(vod.game_id, entry);
      }

      // Filter out ignored and already indexed games
      const filterDataResult = await client.query(`
        WITH ignored_games AS (
          SELECT DISTINCT item_id 
          FROM ignored_discovery_items 
          WHERE user_id = $1 AND item_type = 'game'
        )
        SELECT 
          ARRAY(SELECT twitch_game_id FROM games WHERE is_active = true) as tracked,
          ARRAY(SELECT item_id FROM ignored_games) as ignored
      `, [userId]);

      const tracked = new Set(filterDataResult.rows[0].tracked || []);
      const ignored = new Set(filterDataResult.rows[0].ignored || []);

      const sortedGameIds = Array.from(uniqueGames.entries())
        .filter(([id]) => !tracked.has(id) && !ignored.has(id))
        .sort((a, b) => b[1].occurrences - a[1].occurrences || b[1].view_count - a[1].view_count)
        .map(([id]) => id)
        .slice(0, 20);

      if (sortedGameIds.length === 0) return [];

      // Enrich games via Twitch API
      try {
        const gamesRes = await this.twitchAPI.apiClient['makeRequest']<any>('/games', { id: sortedGameIds });
        const gameObj = new Map(gamesRes.data.map((g: any) => [g.id, g]));

        const recommendations: GameRecommendation[] = [];

        for (const gameId of sortedGameIds) {
          const g = gameObj.get(gameId);
          if (!g) continue; // Skip if game data not found from Twitch API

          const stats = uniqueGames.get(gameId);
          if (!stats) continue;

          if (activePrefs.min_viewers !== undefined && stats.view_count < activePrefs.min_viewers) continue;
          if (activePrefs.max_viewers !== undefined && stats.view_count > activePrefs.max_viewers) continue;

          const score = Math.min(1.0, (stats.view_count / 1000000) * 0.7 + (stats.occurrences / 10) * 0.3);

          const recommendation_reasons: RecommendationReason<GameReasonType>[] = [];
          recommendation_reasons.push({ type: 'CHANNEL_OVERLAP' as const, strength: Math.min(1.0, stats.occurrences / 5) });
          recommendation_reasons.push({ type: 'VIEWER_OVERLAP' as const, strength: Math.min(1.0, stats.view_count / 1000000) });

          recommendations.push({
            type: 'game' as const,
            id: g.id.toString(),
            game_id: g.id,
            name: g.name,
            box_art_url: g.box_art_url ? g.box_art_url.replace('{width}x{height}', '285x380') : '/api/placeholder/285/380',
            compatibility_score: score,
            recommendation_reasons,
            tags: g.tags || []
          });
        }

        return recommendations.sort((a, b) => b.compatibility_score - a.compatibility_score).slice(0, 5);
      } catch (e) {
        logger.warn('Failed to enrich game recommendations', e);
        return [];
      }
    } catch (error) {
      logger.error('Error getting game recommendations:', error);
      return [];
    } finally {
      client.release();
    }
  }
}

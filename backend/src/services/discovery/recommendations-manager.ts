// Filepath: backend/src/services/discovery/recommendations-manager.ts

import { Pool } from 'pg';
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

  /**
   * Get channel recommendations from LOCAL DB.
   * Finds channels that share games with the user's tracked channels,
   * scored by how many games overlap.
   */
  async getChannelRecommendations(
    userId: string,
    userPrefs: UserPreferences
  ): Promise<ChannelRecommendation[]> {
    const client = await this.pool.connect();
    try {
      // Pure SQL: find untracked channels that share games with tracked channels
      let queryText = `
        WITH user_games AS (
          -- Games played by user's tracked channels
          SELECT DISTINCT cgs.game_id
          FROM channel_game_stats cgs
          JOIN channels c ON cgs.channel_id = c.id
          WHERE c.is_active = true
          UNION
          -- Games tracked explicitly by the user
          SELECT id as game_id
          FROM games
          WHERE is_active = true
        ),
        ignored_channels AS (
          SELECT DISTINCT item_id::integer
          FROM ignored_discovery_items
          WHERE user_id = $1 AND item_type = 'channel'
        )
      `;

      let whereClauses = [
        "c.is_active = false",
        "cgs.game_id IN (SELECT game_id FROM user_games)",
        "c.id NOT IN (SELECT item_id FROM ignored_channels)"
      ];

      const queryParams: any[] = [userId];
      let paramCount = 1;

      // Add minimum viewers filter
      if (userPrefs.min_viewers !== undefined) {
        paramCount++;
        whereClauses.push(`cgs.avg_viewers >= $${paramCount}`);
        queryParams.push(userPrefs.min_viewers);
      }

      // Add maximum viewers filter
      if (userPrefs.max_viewers !== undefined) {
        paramCount++;
        whereClauses.push(`cgs.avg_viewers <= $${paramCount}`);
        queryParams.push(userPrefs.max_viewers);
      }

      // Add languages filter
      if (userPrefs.preferred_languages && userPrefs.preferred_languages.length > 0) {
        const langParams = userPrefs.preferred_languages.map(lang => {
          paramCount++;
          queryParams.push(lang.toLowerCase());
          return `$${paramCount}`;
        });
        whereClauses.push(`c.language IN (${langParams.join(', ')})`);
      }

      // Add specific games filter
      if (userPrefs.preferred_game_ids && userPrefs.preferred_game_ids.length > 0) {
        paramCount++;
        whereClauses.push(`cgs.game_id = ANY($${paramCount}::integer[])`);
        queryParams.push(userPrefs.preferred_game_ids);
      }

      // Add tags filter (overlap using && so if they share any tag it matches)
      if (userPrefs.tags && userPrefs.tags.length > 0) {
        paramCount++;
        whereClauses.push(`c.tags && $${paramCount}::text[]`);
        queryParams.push(userPrefs.tags);
      }

      queryText += `
        , candidate_channels AS (
          -- Untracked channels that play at least one of the user's games
          SELECT
            c.id,
            c.twitch_id,
            c.username,
            c.display_name,
            c.profile_image_url,
            c.follower_count,
            COUNT(DISTINCT cgs.game_id) as shared_games,
            (SELECT COUNT(DISTINCT game_id) FROM user_games) as total_user_games,
            MAX(cgs.avg_viewers) as best_avg_viewers,
            MAX(cgs.peak_viewers) as best_peak_viewers,
            MAX(cgs.total_streams) as most_streams,
            -- Aggregate overlapping games into a JSON array
            json_agg(DISTINCT jsonb_build_object('id', g.id, 'twitch_game_id', g.twitch_game_id, 'name', g.name, 'box_art_url', g.box_art_url)) as shared_games_list
          FROM channel_game_stats cgs
          JOIN channels c ON cgs.channel_id = c.id
          JOIN games g ON cgs.game_id = g.id
          WHERE ${whereClauses.join(' AND ')}
          GROUP BY c.id, c.twitch_id, c.username, c.display_name, c.profile_image_url, c.follower_count
        )
        SELECT *
        FROM candidate_channels
        ORDER BY shared_games DESC, best_avg_viewers DESC
        LIMIT 50
      `;

      const result = await client.query(queryText, queryParams);

      if (result.rows.length === 0) {
        logger.info('[Recommendations] No channel candidates found in local DB');
        return [];
      }

      logger.info(`[Recommendations] Found ${result.rows.length} channel candidates from local DB`);

      // Fetch 1 recent VOD for each channel to display as a preview
      const channelsWithVods = await Promise.all(result.rows.map(async (row) => {
        const recent_vods: { thumbnail_url: string; url: string; title: string; game_name: string }[] = [];
        try {
          // This API call is lightweight (only 1 VOD), but since we have multiple candidates,
          // we do it in parallel. In a production system, this could be cached or pre-fetched.
          const vods = await this.twitchAPI.getChannelVODs(row.twitch_id);
          if (vods && vods.length > 0) {
            const sharedTwitchGameIds = new Set(row.shared_games_list?.map((g: any) => g.twitch_game_id));
            // Get channel's current game from /channels API
            const chInfo = await this.twitchAPI.getChannelInfoById(row.twitch_id);
            const isPlayingSharedGame = chInfo && chInfo.game_id && sharedTwitchGameIds.has(chInfo.game_id);
            const gameName = isPlayingSharedGame
              ? row.shared_games_list?.find((g: any) => g.twitch_game_id === chInfo.game_id)?.name || 'Unknown Game'
              : 'Recent Stream';

            // Push up to 5 recent VODs
            for (const vod of vods.slice(0, 5)) {
              recent_vods.push({
                thumbnail_url: vod.thumbnail_url?.replace(/%?{width}/g, '320').replace(/%?{height}/g, '180') || '',
                url: vod.url,
                title: vod.title,
                game_name: gameName
              });
            }
          }
        } catch (e) {
          logger.warn(`Could not fetch VOD preview for ${row.username}`);
        }

        const sharedGames = parseInt(row.shared_games);
        const totalUserGames = parseInt(row.total_user_games) || 1;

        // 1 shared game = 50%, 2 = 75%, 3+ = 100%
        const gameOverlapScore = Math.min(1.0, 0.5 + (sharedGames - 1) * 0.25);

        // Stream activity bonus (more streams = more dedicated to those games)
        const activityScore = Math.min(1.0, parseInt(row.most_streams) / 10);

        const compatibility_score = Math.min(1.0, gameOverlapScore * 0.7 + activityScore * 0.3);

        const recommendation: ChannelRecommendation = {
          type: 'channel',
          id: row.twitch_id,
          display_name: row.display_name || row.username,
          login: row.username,
          profile_image_url: row.profile_image_url || '',
          description: `Plays ${sharedGames} game${sharedGames !== 1 ? 's' : ''} you follow`,
          viewer_count: parseInt(row.best_avg_viewers) || 0,
          compatibility_score,
          recommendation_reasons: [{
            type: 'GAME_OVERLAP',
            strength: gameOverlapScore
          }],
          shared_games_list: row.shared_games_list || [],
          recent_vods,
          tags: []
        };
        return recommendation;
      })).then(results => results.filter(c => c !== null) as ChannelRecommendation[]);

      // Apply confidence threshold filter in memory since it requires the computed score
      const threshold = userPrefs.confidence_threshold ?? 0;
      return channelsWithVods.filter(c => c.compatibility_score >= threshold);
    } catch (error) {
      logger.error('Error getting channel recommendations:', error);
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * Get game recommendations from LOCAL DB.
   * Finds games played by discovered channels but not currently tracked by the user.
   */
  async getGameRecommendations(userId: string, activePrefs: UserPreferences): Promise<GameRecommendation[]> {
    const client = await this.pool.connect();
    try {
      // Pure SQL: find games played by discovered channels but not tracked
      const result = await client.query(`
        WITH user_games AS (
          -- Games the user already tracks (played by their active channels)
          SELECT DISTINCT cgs.game_id
          FROM channel_game_stats cgs
          JOIN channels c ON cgs.channel_id = c.id
          WHERE c.is_active = true
        ),
        ignored_games AS (
          SELECT DISTINCT item_id
          FROM ignored_discovery_items
          WHERE user_id = $1 AND item_type = 'game'
        ),
        candidate_games AS (
          SELECT
            g.id,
            g.twitch_game_id,
            g.name,
            g.box_art_url,
            COUNT(DISTINCT cgs.channel_id) as channel_count,
            SUM(cgs.total_streams) as total_streams,
            MAX(cgs.avg_viewers) as best_avg_viewers,
            MAX(cgs.peak_viewers) as best_peak_viewers
          FROM channel_game_stats cgs
          JOIN games g ON cgs.game_id = g.id
          WHERE cgs.game_id NOT IN (SELECT game_id FROM user_games)
          AND g.twitch_game_id NOT IN (SELECT item_id FROM ignored_games)
          AND g.is_active = true
          GROUP BY g.id, g.twitch_game_id, g.name, g.box_art_url
        )
        SELECT *
        FROM candidate_games
        ORDER BY channel_count DESC, total_streams DESC
        LIMIT 10
      `, [userId]);

      if (result.rows.length === 0) {
        logger.info('[Recommendations] No game candidates found in local DB');
        return [];
      }

      logger.info(`[Recommendations] Found ${result.rows.length} game candidates from local DB`);

      return result.rows.map(row => {
        const channelCount = parseInt(row.channel_count);
        const totalStreams = parseInt(row.total_streams);

        // Score based on how many channels play this game
        const channelOverlapScore = Math.min(1.0, channelCount / 5);
        const activityScore = Math.min(1.0, totalStreams / 20);
        const score = channelOverlapScore * 0.6 + activityScore * 0.4;

        const recommendation_reasons: RecommendationReason<GameReasonType>[] = [
          { type: 'CHANNEL_OVERLAP' as const, strength: channelOverlapScore },
          { type: 'VIEWER_OVERLAP' as const, strength: activityScore }
        ];

        return {
          type: 'game' as const,
          id: row.twitch_game_id,
          game_id: row.twitch_game_id,
          name: row.name,
          box_art_url: row.box_art_url
            ? row.box_art_url.replace('{width}x{height}', '285x380').replace('{width}', '285').replace('{height}', '380')
            : '/api/placeholder/285/380',
          compatibility_score: score,
          recommendation_reasons,
          tags: []
        };
      });
    } catch (error) {
      logger.error('Error getting game recommendations:', error);
      return [];
    } finally {
      client.release();
    }
  }
}

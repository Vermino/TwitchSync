// Filepath: backend/src/services/discovery/recommendations-manager.ts

import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import { TwitchService } from '../twitch/service';
import {
  ChannelRecommendation,
  GameRecommendation,
  RecommendationReason,
  UserPreferences
} from '../../types/discovery';

export class RecommendationsManager {
  constructor(
    private pool: Pool,
    private twitchAPI: TwitchService
  ) {}

  async getChannelRecommendations(
    userId: string,
    userPrefs: UserPreferences
  ): Promise<ChannelRecommendation[]> {
    try {
      const channels = await this.twitchAPI.getTopStreams({
        languages: userPrefs.preferred_languages,
        limit: 100
      });

      const recommendations = await Promise.all(
        channels.map(async (channel) => {
          const compatibility = await this.getChannelCompatibility(channel.id, userId);
          const reasons = await this.getRecommendationReasons(channel.id, userId);

          const recommendation: ChannelRecommendation = {
            type: 'channel',
            id: channel.id,
            display_name: channel.user_name,
            login: channel.user_login,
            profile_image_url: channel.thumbnail_url,
            description: channel.title,
            viewer_count: channel.viewer_count,
            compatibility_score: compatibility,
            recommendation_reasons: reasons
          };

          return recommendation;
        })
      );

      return recommendations.filter(channel =>
        channel.viewer_count >= userPrefs.min_viewers &&
        channel.viewer_count <= userPrefs.max_viewers &&
        channel.compatibility_score >= userPrefs.confidence_threshold
      );
    } catch (error) {
      logger.error('Error getting channel recommendations:', error);
      throw error;
    }
  }

  async getGameRecommendations(userId: string): Promise<GameRecommendation[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        game_id: string;
        name: string;
        box_art_url: string;
        channel_count: number;
      }>(`
        SELECT 
          g.id as game_id,
          g.name,
          g.box_art_url,
          COUNT(DISTINCT cgh.channel_id) as channel_count
        FROM games g
        JOIN channel_game_history cgh ON g.id = cgh.game_id
        WHERE cgh.channel_id IN (
          SELECT channel_id 
          FROM user_channel_preferences 
          WHERE user_id = $1
        )
        GROUP BY g.id, g.name, g.box_art_url
        HAVING COUNT(DISTINCT cgh.channel_id) > 2
      `, [userId]);

      return result.rows.map(game => ({
        type: 'game' as const,
        id: game.game_id,
        game_id: game.game_id,
        name: game.name,
        box_art_url: game.box_art_url,
        compatibility_score: Math.min(game.channel_count * 0.1, 1)
      }));
    } catch (error) {
      logger.error('Error getting game recommendations:', error);
      return [];
    } finally {
      client.release();
    }
  }

  private async getChannelCompatibility(channelId: string, userId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ compatibility_score: number }>(`
        WITH user_preferences AS (
          SELECT 
            preferred_languages,
            schedule_match,
            min_viewers,
            max_viewers
          FROM discovery_preferences
          WHERE user_id = $1
        ),
        channel_stats AS (
          SELECT 
            c.id,
            c.language,
            cm.avg_viewers,
            COUNT(DISTINCT cgh.game_id) as games_in_common
          FROM channels c
          LEFT JOIN channel_metrics cm ON c.id = cm.channel_id
          LEFT JOIN channel_game_history cgh ON c.id = cgh.channel_id
          WHERE c.id = $2
          AND cgh.game_id IN (
            SELECT game_id FROM user_game_preferences WHERE user_id = $1
          )
          GROUP BY c.id, c.language, cm.avg_viewers
        )
        SELECT 
          CASE
            WHEN cs.avg_viewers BETWEEN up.min_viewers AND up.max_viewers THEN 0.3
            ELSE 0
          END +
          CASE
            WHEN cs.language = ANY(up.preferred_languages) THEN 0.2
            ELSE 0
          END +
          LEAST(cs.games_in_common * 0.1, 0.3) as compatibility_score
        FROM user_preferences up
        CROSS JOIN channel_stats cs
      `, [userId, channelId]);

      return result.rows[0]?.compatibility_score || 0;
    } catch (error) {
      logger.error('Error calculating channel compatibility:', error);
      return 0;
    } finally {
      client.release();
    }
  }

  private async getRecommendationReasons(channelId: string, userId: string): Promise<RecommendationReason[]> {
    const client = await this.pool.connect();
    try {
      const reasons: RecommendationReason[] = [];

      const gameOverlap = await client.query<{ common_games: number }>(`
        SELECT COUNT(DISTINCT cgh.game_id)::BIGINT as common_games
        FROM channel_game_history cgh
        WHERE cgh.channel_id = $1
        AND cgh.game_id IN (
          SELECT game_id FROM user_game_preferences WHERE user_id = $2
        )
      `, [channelId, userId]);

      if (gameOverlap.rows[0].common_games > 0) {
        reasons.push({
          type: 'GAME_OVERLAP',
          strength: Math.min(gameOverlap.rows[0].common_games * 0.2, 1)
        });
      }

      const viewerOverlap = await client.query<{ common_viewers: number; avg_viewers: number }>(`
        SELECT 
          COUNT(DISTINCT v1.viewer_id)::BIGINT as common_viewers,
          (
            SELECT AVG(viewer_count)::BIGINT
            FROM channel_metrics
            WHERE channel_id = $1
          ) as avg_viewers
        FROM channel_viewers v1
        JOIN channel_viewers v2 ON v1.viewer_id = v2.viewer_id
        WHERE v1.channel_id = $1
        AND v2.channel_id IN (
          SELECT channel_id 
          FROM user_channel_preferences 
          WHERE user_id = $2
        )
      `, [channelId, userId]);

      if (viewerOverlap.rows[0]?.common_viewers > 0) {
        const overlapRate = viewerOverlap.rows[0].common_viewers / viewerOverlap.rows[0].avg_viewers;
        reasons.push({
          type: 'VIEWER_OVERLAP',
          strength: Math.min(overlapRate, 1)
        });
      }

      return reasons;
    } catch (error) {
      logger.error('Error calculating recommendation reasons:', error);
      return [];
    } finally {
      client.release();
    }
  }
}

// Filepath: backend/src/services/discovery/index.ts

import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import { TwitchAPIService } from '../twitch/api';
import type {
  Recommendation,
  ChannelRecommendation,
  GameRecommendation,
  PremiereEvent,
  TwitchStream,
  StreamFilters,
  UserPreferences,
} from '../../types/database';

interface ChannelEnriched {
  id: string;
  display_name: string;
  twitch_id: string;
  tags?: string[];
}

interface GameEnriched {
  id: string;
  name: string;
  genres?: string[];
}

interface RecommendationReason {
  type: string;
  strength: number;
}

export class DiscoveryService {
  private static instance: DiscoveryService;
  private checkInterval: NodeJS.Timeout | null = null;
  private twitchAPI: TwitchAPIService;

  private constructor(private pool: Pool) {
    this.twitchAPI = TwitchAPIService.getInstance();
  }

  public static getInstance(pool: Pool): DiscoveryService {
    if (!DiscoveryService.instance) {
      DiscoveryService.instance = new DiscoveryService(pool);
    }
    return DiscoveryService.instance;
  }

  private async getDefaultPreferences(): Promise<UserPreferences> {
    return {
      content_rating: "all",
      id: 0,
      user_id: 0,
      preferred_languages: ['en'],
      min_viewers: 100,
      max_viewers: 50000,
      preferred_categories: [],
      schedule_preference: 'any',
      notify_only: false,
      schedule_match: true,
      confidence_threshold: 0.7,
      created_at: new Date(),
      updated_at: new Date()
    };
  }

  async getRecommendations(userId: string): Promise<Recommendation[]> {
    const client = await this.pool.connect();
    try {
      const prefsResult = await client.query<UserPreferences>(`
        SELECT 
          id,
          user_id,
          min_viewers,
          max_viewers,
          preferred_languages,
          content_rating,
          notify_only,
          schedule_match,
          confidence_threshold
        FROM discovery_preferences 
        WHERE user_id = $1
      `, [userId]);

      let userPrefs = prefsResult.rows[0];

      if (!userPrefs) {
        const defaultPrefs = await this.getDefaultPreferences();
        const insertResult = await client.query(`
          INSERT INTO discovery_preferences (
            user_id,
            min_viewers,
            max_viewers,
            preferred_languages,
            content_rating,
            notify_only,
            schedule_match,
            confidence_threshold
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [
          userId,
          defaultPrefs.min_viewers,
          defaultPrefs.max_viewers,
          defaultPrefs.preferred_languages,
          defaultPrefs.content_rating,
          defaultPrefs.notify_only,
          defaultPrefs.schedule_match,
          defaultPrefs.confidence_threshold
        ]);

        userPrefs = insertResult.rows[0];
      }

      const channels = await this.twitchAPI.getTopStreams({
        languages: userPrefs.preferred_languages,
        limit: 100
      });

      const [enrichedChannels, gameRecs] = await Promise.all([
        Promise.all(
          channels.map(async (channel: TwitchStream) => {
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
        ),
        this.getGameRecommendations(userId)
      ]);

      const filteredChannels = enrichedChannels.filter(channel =>
        channel.viewer_count >= userPrefs.min_viewers &&
        channel.viewer_count <= userPrefs.max_viewers &&
        channel.compatibility_score >= userPrefs.confidence_threshold
      );

      return [...filteredChannels, ...gameRecs]
        .sort((a, b) => b.compatibility_score - a.compatibility_score);

    } catch (error) {
      logger.error('Error getting recommendations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async getGameRecommendations(userId: string): Promise<GameRecommendation[]> {
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
        SELECT COUNT(DISTINCT cgh.game_id) as common_games
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
          COUNT(DISTINCT v1.viewer_id) as common_viewers,
          (
            SELECT AVG(viewer_count)
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

  async startMonitoring(checkIntervalMinutes: number = 15): Promise<void> {
    logger.info(`Starting discovery monitoring with ${checkIntervalMinutes} minute interval`);

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    await this.detectPremieres();
    await this.detectRisingChannels();

    this.checkInterval = setInterval(async () => {
      try {
        await this.detectPremieres();
        await this.detectRisingChannels();
      } catch (error) {
        logger.error('Error in discovery monitoring interval:', error);
      }
    }, checkIntervalMinutes * 60 * 1000);
  }

  async stopMonitoring(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async detectPremieres(): Promise<PremiereEvent[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const channelsResult = await client.query<ChannelEnriched>(`
        SELECT DISTINCT c.*
        FROM channels c
        JOIN user_channel_preferences ucp ON c.id = ucp.channel_id
        WHERE c.is_active = true
      `);

      const premieres: PremiereEvent[] = [];

      for (const channel of channelsResult.rows) {
        try {
          const historyResult = await client.query<{ game_id: string }>(`
            SELECT DISTINCT game_id
            FROM channel_game_history
            WHERE channel_id = $1
          `, [channel.id]);

          const playedGameIds = new Set(historyResult.rows.map(row => row.game_id));
          const currentGame = await this.twitchAPI.getCurrentGame(channel.twitch_id);

          if (currentGame && !playedGameIds.has(currentGame.id)) {
            const premiere: PremiereEvent = {
              id: `${channel.id}-${currentGame.id}`,
              type: 'CHANNEL_PREMIERE',
              channel_id: channel.id,
              game_id: currentGame.id,
              start_time: new Date().toISOString(),
              predicted_viewers: await this.predictViewers(channel.id, currentGame.id),
              confidence_score: await this.calculateConfidence(channel.id, currentGame.id),
              similar_channels: (await this.findSimilarChannels(channel.id, currentGame.id)).map(String),
              viewer_trend: await this.analyzeViewerTrend(channel.id),
              metadata: {
                gameGenres: currentGame.genres,
                channelTags: channel.tags,
                isFirstPlay: true
              }
            };

            await client.query(`
              INSERT INTO premiere_events (
                type,
                channel_id,
                game_id,
                start_time,
                predicted_viewers,
                confidence_score,
                similar_channels,
                viewer_trend,
                metadata
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
              premiere.type,
              premiere.channel_id,
              premiere.game_id,
              premiere.start_time,
              premiere.predicted_viewers,
              premiere.confidence_score,
              premiere.similar_channels,
              premiere.viewer_trend,
              premiere.metadata
            ]);

            premieres.push(premiere);
            logger.info(`Detected premiere: ${channel.display_name} playing ${currentGame.name}`);
          }
        } catch (error) {
          logger.error(`Error processing channel ${channel.display_name}:`, error);
          continue;
        }
      }

      await client.query('COMMIT');
      return premieres;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in premiere detection:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async detectRisingChannels(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{
        id: string;
        display_name: string;
        current_game_id: string;
        avg_growth_rate: number;
        peak_viewers: number;
      }>(`
        WITH channel_growth AS (
          SELECT 
            channel_id,
            viewer_count,
            viewer_growth_rate,
            LAG(viewer_count) OVER (
              PARTITION BY channel_id 
              ORDER BY recorded_at
            ) as previous_count
          FROM channel_metrics
          WHERE recorded_at > NOW() - INTERVAL '7 days'
        )
        SELECT 
          c.*,
          AVG(cg.viewer_growth_rate) as avg_growth_rate,
          MAX(cg.viewer_count) as peak_viewers
        FROM channels c
        JOIN channel_growth cg ON c.id = cg.channel_id
        GROUP BY c.id
        HAVING AVG(cg.viewer_growth_rate) > 0.1
      `);

      for (const channel of result.rows) {
        await this.createRisingStarEvent(client, channel);
      }
    } catch (error) {
      logger.error('Error in rising channel detection:', error);
    } finally {
      client.release();
    }
  }

  private async createRisingStarEvent(
    client: PoolClient,
    channel: {
      id: string;
      display_name: string;
      current_game_id: string;
      avg_growth_rate: number;
      peak_viewers: number;
    }
  ): Promise<void> {
    try {
      await client.query(`
        INSERT INTO premiere_events (
          type,
          channel_id,
          game_id,
          start_time,
          predicted_viewers,
          confidence_score,
          similar_channels,
          viewer_trend,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        'RISING_STAR',
        channel.id,
        channel.current_game_id,
        new Date().toISOString(),
        channel.peak_viewers,
        0.85,
        await this.findSimilarChannels(channel.id, channel.current_game_id),
        'rising',
        {
          growthRate: channel.avg_growth_rate,
          peakViewers: channel.peak_viewers,
          detectionDate: new Date()
        }
      ]);
    } catch (error) {
      logger.error(`Error creating rising star event for ${channel.display_name}:`, error);
    }
  }

  private async predictViewers(channelId: string, gameId: string): Promise<number> {
    try {
      const result = await this.pool.query<{
        avg_channel_viewers: number;
        avg_game_viewers: number;
      }>(`
        WITH channel_stats AS (
          SELECT AVG(viewer_count) as avg_channel_viewers
          FROM channel_metrics
          WHERE channel_id = $1
        ),
        game_stats AS (
          SELECT AVG(viewer_count) as avg_game_viewers
          FROM channel_metrics cm
          JOIN channels c ON cm.channel_id = c.id
          WHERE c.current_game_id = $2
        )
        SELECT 
          cs.avg_channel_viewers,
          gs.avg_game_viewers
        FROM channel_stats cs, game_stats gs
      `, [channelId, gameId]);

      const { avg_channel_viewers, avg_game_viewers } = result.rows[0];
      return Math.round((avg_channel_viewers + avg_game_viewers) / 2);
    } catch (error) {
      logger.error('Error predicting viewers:', error);
      return 0;
    }
  }

  private async calculateConfidence(channelId: string, gameId: string): Promise<number> {
    try {
      const result = await this.pool.query<{
        avg_viewers: number;
        viewer_stddev: number;
        similar_games: number;
      }>(`
        WITH channel_consistency AS (
          SELECT 
            AVG(viewer_count) as avg_viewers,
            STDDEV(viewer_count) as viewer_stddev
          FROM channel_metrics
          WHERE channel_id = $1
        ),
        game_similarity AS (
          SELECT COUNT(*) as similar_games
          FROM channel_game_history cgh
          JOIN games g ON cgh.game_id = g.id
          WHERE cgh.channel_id = $1
          AND g.id IN (
            SELECT g2.id 
            FROM games g2
            WHERE g2.genres && (SELECT genres FROM games WHERE id = $2)
          )
        )
        SELECT 
          cc.avg_viewers,
          cc.viewer_stddev,
          gs.similar_games
        FROM channel_consistency cc, game_similarity gs
      `, [channelId, gameId]);

      const { avg_viewers, viewer_stddev, similar_games } = result.rows[0];

      const viewerStability = 1 - (viewer_stddev / avg_viewers);
      const genreFamiliarity = Math.min(similar_games / 10, 1);

      return Math.min((viewerStability + genreFamiliarity) / 2, 1);
    } catch (error) {
      logger.error('Error calculating confidence:', error);
      return 0.5;
    }
  }

  private async findSimilarChannels(channelId: string, gameId: string): Promise<number[]> {
    try {
      const result = await this.pool.query<{ id: number }>(`
        SELECT DISTINCT c.id
        FROM channels c
        JOIN channel_game_history cgh ON c.id = cgh.channel_id
        WHERE c.id != $1
        AND cgh.game_id = $2
        AND EXISTS (
          SELECT 1 
          FROM channel_game_history cgh2
          WHERE cgh2.channel_id = $1
          AND cgh2.game_id = cgh.game_id
          AND cgh2.game_id != $2
        )
        LIMIT 10
      `, [channelId, gameId]);

      return result.rows.map(row => row.id);
    } catch (error) {
      logger.error('Error finding similar channels:', error);
      return [];
    }
  }

  private async analyzeViewerTrend(channelId: string): Promise<'rising' | 'stable' | 'falling'> {
    try {
      const result = await this.pool.query<{ trend: 'rising' | 'stable' | 'falling' }>(`
        WITH daily_stats AS (
          SELECT 
            DATE_TRUNC('day', recorded_at) as day,
            AVG(viewer_count) as avg_viewers
          FROM channel_metrics
          WHERE channel_id = $1
          AND recorded_at > NOW() - INTERVAL '7 days'
          GROUP BY DATE_TRUNC('day', recorded_at)
          ORDER BY day DESC
        ),
        trend_calc AS (
          SELECT 
            avg_viewers,
            LAG(avg_viewers) OVER (ORDER BY day) as prev_viewers
          FROM daily_stats
        )
        SELECT 
          CASE
            WHEN AVG((avg_viewers - prev_viewers) / NULLIF(prev_viewers, 0)) > 0.05 THEN 'rising'
            WHEN AVG((avg_viewers - prev_viewers) / NULLIF(prev_viewers, 0)) < -0.05 THEN 'falling'
            ELSE 'stable'
          END as trend
        FROM trend_calc
        WHERE prev_viewers IS NOT NULL
      `, [channelId]);

      return result.rows[0]?.trend || 'stable';
    } catch (error) {
      logger.error('Error analyzing viewer trend:', error);
      return 'stable';
    }
  }

  async cleanupOldEvents(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        DELETE FROM premiere_events
        WHERE start_time < NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1
          FROM user_premiere_tracking
          WHERE premiere_id = premiere_events.id
        )
      `);

      await client.query(`
        INSERT INTO channel_metrics_archive
        SELECT *
        FROM channel_metrics
        WHERE recorded_at < NOW() - INTERVAL '30 days'
      `);

      await client.query(`
        DELETE FROM channel_metrics
        WHERE recorded_at < NOW() - INTERVAL '30 days'
      `);
    } catch (error) {
      logger.error('Error cleaning up old events:', error);
    } finally {
      client.release();
    }
  }
}

export const discoveryService = (pool: Pool) => DiscoveryService.getInstance(pool);
export default discoveryService;

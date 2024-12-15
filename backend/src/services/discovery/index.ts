// backend/src/services/discovery/index.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { twitchAPI } from '../twitch/api';

export class DiscoveryService {
  private static instance: DiscoveryService;
  private checkInterval: NodeJS.Timeout | null = null;

  private constructor(private pool: Pool) {}

  public static getInstance(pool: Pool): DiscoveryService {
    if (!DiscoveryService.instance) {
      DiscoveryService.instance = new DiscoveryService(pool);
    }
    return DiscoveryService.instance;
  }

  async detectPremieres(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get all active channels
      const channelsResult = await client.query(`
        SELECT DISTINCT c.*
        FROM channels c
        JOIN user_channel_preferences ucp ON c.id = ucp.channel_id
        WHERE c.is_active = true
      `);

      for (const channel of channelsResult.rows) {
        try {
          // Get channel's game history
          const historyResult = await client.query(`
            SELECT DISTINCT game_id
            FROM channel_game_history
            WHERE channel_id = $1
          `, [channel.id]);

          const playedGameIds = new Set(historyResult.rows.map(row => row.game_id));

          // Check current game
          const currentGame = await twitchAPI.getCurrentGame(channel.twitch_id);

          if (currentGame && !playedGameIds.has(currentGame.id)) {
            // This is a premiere - create event
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
              'CHANNEL_PREMIERE',
              channel.id,
              currentGame.id,
              new Date(),
              await this.predictViewers(channel.id, currentGame.id),
              await this.calculateConfidence(channel.id, currentGame.id),
              await this.findSimilarChannels(channel.id, currentGame.id),
              await this.analyzeViewerTrend(channel.id),
              {
                gameGenres: currentGame.genres,
                channelTags: channel.tags,
                isFirstPlay: true
              }
            ]);

            logger.info(`Detected premiere: ${channel.display_name} playing ${currentGame.name}`);
          }
        } catch (error) {
          logger.error(`Error processing channel ${channel.display_name}:`, error);
          continue;
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in premiere detection:', error);
    } finally {
      client.release();
    }
  }

  async detectRisingChannels(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Get channels with significant viewer growth
      const result = await client.query(`
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

  private async createRisingStarEvent(client: any, channel: any): Promise<void> {
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
        new Date(),
        channel.peak_viewers,
        0.85, // High confidence for actual growth
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
      const result = await this.pool.query(`
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
      // Calculate confidence based on various factors
      const result = await this.pool.query(`
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

      // Calculate confidence score (0-1) based on metrics
      const viewerStability = 1 - (viewer_stddev / avg_viewers);
      const genreFamiliarity = Math.min(similar_games / 10, 1);

      return Math.min((viewerStability + genreFamiliarity) / 2, 1);
    } catch (error) {
      logger.error('Error calculating confidence:', error);
      return 0.5; // Default moderate confidence
    }
  }

  private async findSimilarChannels(channelId: string, gameId: string): Promise<number> {
    try {
      const result = await this.pool.query(`
        SELECT COUNT(DISTINCT c.id) as similar_count
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
      `, [channelId, gameId]);

      return result.rows[0].similar_count;
    } catch (error) {
      logger.error('Error finding similar channels:', error);
      return 0;
    }
  }

 private async analyzeViewerTrend(channelId: string): Promise<'rising' | 'stable' | 'falling'> {
    try {
      const result = await this.pool.query(`
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

  async startMonitoring(checkIntervalMinutes: number = 15): Promise<void> {
    logger.info(`Starting discovery monitoring with ${checkIntervalMinutes} minute interval`);

    // Clear any existing interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Run initial checks
    await this.detectPremieres();
    await this.detectRisingChannels();

    // Set up regular monitoring
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

  async getChannelCompatibility(channelId: string, userId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
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
          LEFT JOIN channel_metrics cm ON c.id = c.id
          LEFT JOIN channel_game_history cgh ON c.id = cgh.channel_id
          WHERE c.id = $2
          AND cgh.game_id IN (
            SELECT game_id FROM user_game_preferences WHERE user_id = $1
          )
          GROUP BY c.id, c.language, cm.avg_viewers
        ),
        schedule_match AS (
          SELECT 
            CASE WHEN EXISTS (
              SELECT 1
              FROM channel_schedule cs
              WHERE cs.channel_id = $2
              AND EXISTS (
                SELECT 1 
                FROM user_schedule us
                WHERE us.user_id = $1
                AND us.day = cs.day
                AND us.start_hour <= cs.end_hour
                AND us.end_hour >= cs.start_hour
              )
            ) THEN 1 ELSE 0 END as has_schedule_match
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
          CASE
            WHEN up.schedule_match AND sm.has_schedule_match = 1 THEN 0.2
            WHEN NOT up.schedule_match THEN 0.2
            ELSE 0
          END +
          LEAST(cs.games_in_common * 0.1, 0.3) as compatibility_score
        FROM user_preferences up
        CROSS JOIN channel_stats cs
        CROSS JOIN schedule_match sm
      `, [userId, channelId]);

      return result.rows[0]?.compatibility_score || 0;
    } catch (error) {
      logger.error('Error calculating channel compatibility:', error);
      return 0;
    } finally {
      client.release();
    }
  }

  async getRecommendationReasons(channelId: string, userId: string): Promise<Array<{type: string, strength: number}>> {
    const client = await this.pool.connect();
    try {
      const reasons: Array<{type: string, strength: number}> = [];

      // Game overlap analysis
      const gameOverlap = await client.query(`
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

      // Viewer overlap analysis
      const viewerOverlap = await client.query(`
        WITH user_channels AS (
          SELECT channel_id
          FROM user_channel_preferences
          WHERE user_id = $1
        ),
        viewer_overlap AS (
          SELECT COUNT(DISTINCT v1.viewer_id) as common_viewers
          FROM channel_viewers v1
          JOIN channel_viewers v2 ON v1.viewer_id = v2.viewer_id
          WHERE v1.channel_id = $2
          AND v2.channel_id IN (SELECT channel_id FROM user_channels)
        )
        SELECT 
          common_viewers,
          (
            SELECT AVG(viewer_count)
            FROM channel_metrics
            WHERE channel_id = $2
          ) as avg_viewers
        FROM viewer_overlap
      `, [userId, channelId]);

      if (viewerOverlap.rows[0]?.common_viewers > 0) {
        const overlapRate = viewerOverlap.rows[0].common_viewers / viewerOverlap.rows[0].avg_viewers;
        reasons.push({
          type: 'VIEWER_OVERLAP',
          strength: Math.min(overlapRate, 1)
        });
      }

      // Schedule compatibility
      const scheduleMatch = await client.query(`
        SELECT 
          CASE WHEN EXISTS (
            SELECT 1
            FROM channel_schedule cs
            WHERE cs.channel_id = $1
            AND EXISTS (
              SELECT 1 
              FROM user_schedule us
              WHERE us.user_id = $2
              AND us.day = cs.day
              AND us.start_hour <= cs.end_hour
              AND us.end_hour >= cs.start_hour
            )
          ) THEN true ELSE false END as has_match
      `, [channelId, userId]);

      if (scheduleMatch.rows[0].has_match) {
        reasons.push({
          type: 'SCHEDULE_MATCH',
          strength: 0.8
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

  async cleanupOldEvents(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Remove old premiere events
      await client.query(`
        DELETE FROM premiere_events
        WHERE start_time < NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1
          FROM user_premiere_tracking
          WHERE premiere_id = premiere_events.id
        )
      `);

      // Archive old metrics
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

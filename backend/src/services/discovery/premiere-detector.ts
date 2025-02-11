// Filepath: backend/src/services/discovery/premiere-detector.ts

import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import { TwitchService } from '../twitch/service';
import { PremiereEvent } from '../../types/discovery';

export class PremiereDetector {
  constructor(
    private pool: Pool,
    private twitchAPI: TwitchService
  ) {}

  async detectPremieres(): Promise<PremiereEvent[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const channelsResult = await client.query<{
        id: string;
        display_name: string;
        twitch_id: string;
        tags?: string[];
      }>(`
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
              similar_channels: await this.findSimilarChannels(channel.id, currentGame.id),
              viewer_trend: await this.analyzeViewerTrend(channel.id),
              metadata: {
                gameGenres: currentGame.genres,
                channelTags: channel.tags,
                isFirstPlay: true,
                detectionDate: new Date().toISOString()
              },
              created_at: new Date().toISOString()
            };

            await this.savePremiereEvent(client, premiere);
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

  private async savePremiereEvent(client: PoolClient, premiere: PremiereEvent): Promise<void> {
    await client.query(`
      INSERT INTO premiere_events (
        id,
        type,
        channel_id,
        game_id,
        start_time,
        predicted_viewers,
        confidence_score,
        similar_channels,
        viewer_trend,
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      premiere.id,
      premiere.type,
      premiere.channel_id,
      premiere.game_id,
      premiere.start_time,
      premiere.predicted_viewers,
      premiere.confidence_score,
      premiere.similar_channels,
      premiere.viewer_trend,
      premiere.metadata,
      premiere.created_at
    ]);
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

  private async findSimilarChannels(channelId: string, gameId: string): Promise<string[]> {
    try {
      const result = await this.pool.query<{ id: string }>(`
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
}

export default PremiereDetector;

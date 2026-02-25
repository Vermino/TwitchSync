// Filepath: backend/src/routes/discovery/controller.ts

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import {
  DiscoveryError,
  validateDiscoveryPreferences,
  validatePremiereExists,
  DiscoveryPreferencesRequest,
  PremiereTrackingRequest,
  FeedFiltersRequest
} from './validation';
import { withTransaction } from '../../middleware/withTransaction';

export class DiscoveryController {
  constructor(private pool: Pool) { }

  getDiscoveryFeed = async (req: Request, res: Response, next: NextFunction) => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new DiscoveryError('User not authenticated', 401);
      }

      // Get or create user's discovery preferences with defaults
      const prefsResult = await client.query(`
        INSERT INTO discovery_preferences (
          user_id, 
          min_viewers, 
          max_viewers, 
          preferred_languages,
          content_rating, 
          notify_only, 
          schedule_match, 
          confidence_threshold
        )
        VALUES ($1, 100, 50000, ARRAY['en'], 'all', false, true, 0.7)
        ON CONFLICT (user_id) DO UPDATE SET
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [userId]);

      const preferences = prefsResult.rows[0];

      // Only return preferences — actual recommendations are fetched
      // via the separate /recommendations/channels and /recommendations/games endpoints
      // which use the RecommendationsManager with Twitch API
      res.json({ preferences });
    } catch (error) {
      logger.error('Error fetching discovery feed:', error);
      next(new DiscoveryError('Failed to fetch discovery feed', 500));
    } finally {
      client.release();
    }
  };

  updatePreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new DiscoveryError('User not authenticated', 401);
      }

      const preferences = req.body as DiscoveryPreferencesRequest['body'];
      validateDiscoveryPreferences(preferences);

      const result = await withTransaction(this.pool, async (client) => {
        const updated = await client.query(`
          UPDATE discovery_preferences
          SET 
            min_viewers = $2,
            max_viewers = $3,
            preferred_languages = $4,
            content_rating = $5,
            notify_only = $6,
            schedule_match = $7,
            confidence_threshold = $8,
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1
          RETURNING *
        `, [
          userId,
          preferences.min_viewers,
          preferences.max_viewers,
          preferences.preferred_languages,
          preferences.content_rating,
          preferences.notify_only,
          preferences.schedule_match,
          preferences.confidence_threshold
        ]);

        return updated.rows[0];
      });

      res.json(result);
    } catch (error) {
      if (error instanceof DiscoveryError) {
        next(error);
      } else {
        logger.error('Error updating preferences:', error);
        next(new DiscoveryError('Failed to update preferences', 500));
      }
    }
  };

  trackPremiere = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new DiscoveryError('User not authenticated', 401);
      }

      const { premiere_id, quality, retention_days, notify } = req.body as PremiereTrackingRequest['body'];

      await withTransaction(this.pool, async (client) => {
        // Verify premiere exists
        const exists = await validatePremiereExists(client, premiere_id);
        if (!exists) {
          throw new DiscoveryError('Premiere not found', 404);
        }

        // Get premiere details
        const premiereResult = await client.query(`
          SELECT 
            pe.*,
            c.id as channel_id,
            g.id as game_id
          FROM premiere_events pe
          JOIN channels c ON pe.channel_id = c.id
          JOIN games g ON pe.game_id = g.id
          WHERE pe.id = $1
        `, [premiere_id]);

        const premiere = premiereResult.rows[0];

        // Create or update VOD preferences
        await client.query(`
          INSERT INTO user_vod_preferences (
            user_id,
            channel_id,
            game_id,
            preferred_quality,
            retention_days,
            notification_settings,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, channel_id)
          DO UPDATE SET
            preferred_quality = $4,
            retention_days = $5,
            notification_settings = $6,
            updated_at = CURRENT_TIMESTAMP
        `, [
          userId,
          premiere.channel_id,
          premiere.game_id,
          quality,
          retention_days,
          { notify_on_start: notify, notify_on_complete: notify }
        ]);

        // Create tracking record
        await client.query(`
          INSERT INTO user_premiere_tracking (
            user_id,
            premiere_id,
            quality,
            created_at
          ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        `, [userId, premiere_id, quality]);

        logger.info(`Premiere ${premiere_id} tracked by user ${userId}`);
      });

      res.json({ message: 'Premiere tracked successfully' });
    } catch (error) {
      if (error instanceof DiscoveryError) {
        next(error);
      } else {
        logger.error('Error tracking premiere:', error);
        next(new DiscoveryError('Failed to track premiere', 500));
      }
    }
  };

  ignoreChannel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new DiscoveryError('User not authenticated', 401);

      const { channel_id } = req.body;
      if (!channel_id) throw new DiscoveryError('channel_id is required', 400);

      await withTransaction(this.pool, async (client) => {
        await client.query(`
          INSERT INTO ignored_discovery_items (user_id, item_type, item_id, created_at)
          VALUES ($1, 'channel', $2, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, item_type, item_id) DO NOTHING
        `, [userId, channel_id]);
      });

      logger.info(`User ${userId} ignored channel ${channel_id}`);
      res.json({ message: 'Channel ignored successfully' });
    } catch (error) {
      if (error instanceof DiscoveryError) next(error);
      else next(new DiscoveryError('Failed to ignore channel', 500));
    }
  };

  ignoreGame = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new DiscoveryError('User not authenticated', 401);

      const { game_id } = req.body;
      if (!game_id) throw new DiscoveryError('game_id is required', 400);

      await withTransaction(this.pool, async (client) => {
        await client.query(`
          INSERT INTO ignored_discovery_items (user_id, item_type, item_id, created_at)
          VALUES ($1, 'game', $2, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, item_type, item_id) DO NOTHING
        `, [userId, game_id]);
      });

      logger.info(`User ${userId} ignored game ${game_id}`);
      res.json({ message: 'Game ignored successfully' });
    } catch (error) {
      if (error instanceof DiscoveryError) next(error);
      else next(new DiscoveryError('Failed to ignore game', 500));
    }
  };

  getDiscoveryStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new DiscoveryError('User not authenticated', 401);
      }

      const result = await this.pool.query(`
        SELECT
          (
            SELECT COUNT(*)
            FROM premiere_events pe
            WHERE pe.start_time > NOW()
            AND pe.predicted_viewers >= (
              SELECT min_viewers FROM discovery_preferences WHERE user_id = $1
            )
          ) as upcoming_premieres,
          
          (
            SELECT COUNT(*)
            FROM user_premiere_tracking upt
            WHERE upt.user_id = $1
            AND upt.created_at > NOW() - INTERVAL '24 hours'
          ) as tracked_premieres,
          
          (
            SELECT COUNT(DISTINCT channel_id)
            FROM channel_metrics cm
            WHERE cm.viewer_growth_rate > 0.1
            AND cm.recorded_at > NOW() - INTERVAL '7 days'
          ) as rising_channels,
          
          (
            SELECT COUNT(DISTINCT uvp.channel_id)
            FROM user_vod_preferences uvp
            WHERE uvp.user_id = $1
          ) as tracked_channels,

          (
            SELECT COUNT(*)
            FROM vods v
            WHERE v.user_id = $1
            AND v.download_status = 'completed'
            AND v.created_at > NOW() - INTERVAL '24 hours'
          ) as downloads_today,

          (
            SELECT json_build_object(
              'total_hours', COALESCE(EXTRACT(EPOCH FROM SUM(duration))/3600, 0),
              'total_premieres', COUNT(DISTINCT CASE WHEN is_premiere THEN id END),
              'unique_games', COUNT(DISTINCT game_id),
              'unique_channels', COUNT(DISTINCT channel_id)
            )
            FROM vods v
            WHERE v.user_id = $1
            AND v.download_status = 'completed'
          ) as lifetime_stats
      `, [userId]);

      // Cache stats for 5 minutes
      res.set('Cache-Control', 'public, max-age=300');
      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error fetching discovery stats:', error);
      next(new DiscoveryError('Failed to fetch discovery stats', 500));
    }
  };
}

export default DiscoveryController;

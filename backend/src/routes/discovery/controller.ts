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
  constructor(private pool: Pool) {}

  getDiscoveryFeed = async (req: Request, res: Response, next: NextFunction) => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new DiscoveryError('User not authenticated', 401);
      }

      // Get user's discovery preferences with fallback to defaults
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

      // Get upcoming premieres based on preferences
      const premieresResult = await client.query(`
        WITH filtered_premieres AS (
          SELECT 
            pe.*,
            c.username, c.display_name, c.profile_image_url,
            g.name as game_name, g.box_art_url,
            EXISTS (
              SELECT 1 
              FROM user_vod_preferences uvp 
              WHERE uvp.user_id = $1 
              AND (uvp.channel_id = pe.channel_id OR uvp.game_id = pe.game_id)
            ) as is_preferred
          FROM premiere_events pe
          JOIN channels c ON pe.channel_id = c.id
          JOIN games g ON pe.game_id = g.id
          WHERE pe.start_time > NOW()
          AND pe.predicted_viewers >= $2
          AND pe.confidence_score >= $3
        )
        SELECT *
        FROM filtered_premieres
        WHERE is_preferred = true
        OR (
          predicted_viewers >= $2 * 2  -- Double threshold for non-preferred
          AND confidence_score >= $3 + 0.1  -- Higher confidence for non-preferred
        )
        ORDER BY start_time ASC
        LIMIT 10
      `, [userId, preferences.min_viewers, preferences.confidence_threshold]);

      // Get rising channels based on metrics
      const risingChannelsResult = await client.query(`
        WITH channel_metrics AS (
          SELECT 
            channel_id,
            AVG(viewer_count) as avg_viewers,
            AVG(viewer_growth_rate) as growth_rate,
            COUNT(DISTINCT vod_id) as recorded_vods
          FROM channel_metrics
          WHERE recorded_at > NOW() - INTERVAL '7 days'
          GROUP BY channel_id
          HAVING AVG(viewer_growth_rate) > 0.1
        )
        SELECT 
          c.*,
          cm.avg_viewers,
          cm.growth_rate,
          cm.recorded_vods,
          g.name as current_game_name,
          g.box_art_url as game_image,
          COALESCE(
            (SELECT COUNT(*) FROM user_vod_preferences uvp
             WHERE uvp.user_id = $1 AND uvp.channel_id = c.id), 
            0
          ) as preference_count
        FROM channels c
        JOIN channel_metrics cm ON c.id = cm.channel_id
        LEFT JOIN games g ON c.current_game_id = g.id
        WHERE cm.avg_viewers BETWEEN $2 AND $3
        ORDER BY 
          preference_count DESC,
          cm.growth_rate DESC,
          cm.avg_viewers DESC
        LIMIT 5
      `, [userId, preferences.min_viewers, preferences.max_viewers]);

      // Get recommendations based on viewing history and preferences
      const recommendationsResult = await client.query(`
        WITH user_history AS (
          SELECT 
            v.channel_id,
            v.game_id,
            COUNT(*) as view_count,
            MAX(v.created_at) as last_viewed
          FROM vods v
          WHERE v.user_id = $1
          AND v.created_at > NOW() - INTERVAL '30 days'
          GROUP BY v.channel_id, v.game_id
        ),
        channel_scores AS (
          SELECT 
            c.id,
            c.username,
            c.display_name,
            c.profile_image_url,
            g.id as game_id,
            g.name as game_name,
            COUNT(DISTINCT uh.game_id) * 0.3 +
            SUM(CASE 
              WHEN uh.last_viewed > NOW() - INTERVAL '7 days' THEN 0.5
              WHEN uh.last_viewed > NOW() - INTERVAL '30 days' THEN 0.3
              ELSE 0.1
            END) +
            COUNT(DISTINCT uh.view_count) * 0.2 as compatibility_score
          FROM channels c
          LEFT JOIN games g ON c.current_game_id = g.id
          LEFT JOIN user_history uh ON c.id = uh.channel_id
          WHERE c.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM user_vod_preferences up
            WHERE up.user_id = $1 AND up.channel_id = c.id
          )
          GROUP BY c.id, c.username, c.display_name, c.profile_image_url, g.id, g.name
        ),
        game_recommendations AS (
          SELECT 
            g.id,
            g.name,
            g.box_art_url,
            COUNT(DISTINCT uh.channel_id) * 0.4 +
            COUNT(DISTINCT pe.id) * 0.3 +
            COUNT(DISTINCT v.id) * 0.3 as compatibility_score,
            COUNT(DISTINCT pe.id) as upcoming_premieres
          FROM games g
          LEFT JOIN user_history uh ON g.id = uh.game_id
          LEFT JOIN premiere_events pe ON g.id = pe.game_id 
            AND pe.start_time > NOW()
          LEFT JOIN vods v ON g.id = v.game_id 
            AND v.created_at > NOW() - INTERVAL '7 days'
          WHERE g.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM user_vod_preferences up
            WHERE up.user_id = $1 AND up.game_id = g.id
          )
          GROUP BY g.id, g.name, g.box_art_url
          HAVING compatibility_score > 0
        )
        SELECT 
          cs.*,
          gr.*
        FROM channel_scores cs
        CROSS JOIN LATERAL (
          SELECT json_agg(gr.*) as game_recommendations
          FROM (
            SELECT * FROM game_recommendations
            ORDER BY compatibility_score DESC
            LIMIT 5
          ) gr
        ) gr
        WHERE cs.compatibility_score > 0
        ORDER BY cs.compatibility_score DESC
        LIMIT 10
      `, [userId]);

      // Cache response for 5 minutes
      res.set('Cache-Control', 'public, max-age=300');
      res.json({
        preferences,
        premieres: premieresResult.rows,
        risingChannels: risingChannelsResult.rows,
        recommendations: {
          channels: recommendationsResult.rows,
          games: recommendationsResult.rows[0]?.game_recommendations || []
        }
      });
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

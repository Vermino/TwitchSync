// backend/src/routes/discovery/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { authenticate } from '../../middleware/auth';

export const createDiscoveryRouter = (pool: Pool) => {
  const router = Router();

  router.get('/feed', authenticate(pool), async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Get discovery preferences with fallback to defaults
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

      // Get premieres
      const premieresResult = await client.query(`
        SELECT 
          pe.*,
          c.username, c.display_name, c.profile_image_url,
          g.name as game_name, g.box_art_url
        FROM premiere_events pe
        JOIN channels c ON pe.channel_id = c.id
        JOIN games g ON CAST(pe.game_id AS VARCHAR) = g.twitch_game_id
        WHERE pe.start_time > NOW()
        AND EXISTS (
          SELECT 1 
          FROM user_preferences up 
          WHERE up.user_id = $1 
          AND up.discovery_settings->>'auto_track' = 'true'
        )
        ORDER BY pe.start_time ASC
        LIMIT 10
      `, [userId]);

      // Get rising channels
      const risingChannelsResult = await client.query(`
        WITH channel_metrics AS (
          SELECT 
            channel_id,
            AVG(viewer_count) as avg_viewers,
            AVG(viewer_growth_rate) as growth_rate
          FROM channel_metrics
          WHERE recorded_at > NOW() - INTERVAL '7 days'
          GROUP BY channel_id
        )
        SELECT 
          c.*,
          COALESCE(cm.avg_viewers, 0) as avg_viewers,
          COALESCE(cm.growth_rate, 0) as growth_rate,
          g.name as current_game_name,
          g.box_art_url as game_image,
          COUNT(DISTINCT v.id) as recorded_vods
        FROM channels c
        LEFT JOIN channel_metrics cm ON c.id = cm.channel_id
        LEFT JOIN games g ON CAST(c.current_game_id AS VARCHAR) = g.twitch_game_id
        LEFT JOIN vods v ON c.id = v.channel_id 
          AND v.download_status = 'completed'
          AND v.user_id = $1
        WHERE COALESCE(cm.growth_rate, 0) > 0.1
        AND COALESCE(cm.avg_viewers, 0) BETWEEN $2 AND $3
        AND c.is_active = true
        GROUP BY 
          c.id, 
          cm.avg_viewers, 
          cm.growth_rate, 
          g.name, 
          g.box_art_url
        ORDER BY cm.growth_rate DESC NULLS LAST
        LIMIT 5
      `, [userId, preferences.min_viewers, preferences.max_viewers]);

      // Get recommendations
      const recommendationsResult = await client.query(`
        WITH user_vod_history AS (
          SELECT DISTINCT 
            v.channel_id,
            COUNT(DISTINCT v.game_id) as games_played,
            COUNT(*) as total_vods
          FROM vods v
          WHERE v.user_id = $1
          AND v.download_status = 'completed'
          GROUP BY v.channel_id
        )
        SELECT 
          c.*,
          COALESCE(uvh.games_played, 0) as game_overlap,
          COALESCE(cm.viewer_count, 0) as current_viewers,
          g.name as current_game_name
        FROM channels c
        LEFT JOIN user_vod_history uvh ON c.id = uvh.channel_id
        LEFT JOIN channel_metrics cm ON c.id = cm.channel_id
        LEFT JOIN games g ON CAST(c.current_game_id AS VARCHAR) = g.twitch_game_id
        WHERE c.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM user_vod_preferences uvp
          WHERE uvp.channel_id = c.id
          AND uvp.user_id = $1
        )
        ORDER BY uvh.games_played DESC NULLS LAST, cm.viewer_count DESC NULLS LAST
        LIMIT 5
      `, [userId]);

      res.json({
        preferences,
        premieres: premieresResult.rows,
        risingChannels: risingChannelsResult.rows,
        recommendations: {
          channels: recommendationsResult.rows
        }
      });

    } catch (error) {
      logger.error('Error fetching discovery feed:', error);
      res.status(500).json({ error: 'Failed to fetch discovery feed' });
    } finally {
      client.release();
    }
  });

  // Preferences route remains unchanged
  router.put('/preferences', authenticate(pool), async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const {
        min_viewers,
        max_viewers,
        preferred_languages,
        content_rating,
        notify_only,
        schedule_match,
        confidence_threshold
      } = req.body;

      const result = await client.query(`
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
        min_viewers,
        max_viewers,
        preferred_languages,
        content_rating,
        notify_only,
        schedule_match,
        confidence_threshold
      ]);

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error updating discovery preferences:', error);
      res.status(500).json({ error: 'Failed to update discovery preferences' });
    } finally {
      client.release();
    }
  });

  router.get('/stats', authenticate(pool), async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const stats = await client.query(`
        SELECT 
          (
            SELECT COUNT(*) 
            FROM premiere_events pe
            WHERE pe.start_time > NOW()
            AND EXISTS (
              SELECT 1 
              FROM user_preferences up 
              WHERE up.user_id = $1 
              AND up.discovery_settings->>'auto_track' = 'true'
            )
          ) as upcoming_premieres,
          (
            SELECT COUNT(*) 
            FROM premiere_events pe
            JOIN vods v ON v.channel_id = pe.channel_id
            WHERE v.user_id = $1 
            AND v.download_status = 'completed'
          ) as tracked_premieres,
          (
            SELECT COUNT(DISTINCT c.id)
            FROM channels c
            JOIN channel_metrics cm ON c.id = cm.channel_id
            WHERE cm.viewer_growth_rate > 0.1
            AND cm.recorded_at > NOW() - INTERVAL '7 days'
          ) as rising_channels,
          (
            SELECT COUNT(*)
            FROM vods v
            WHERE v.user_id = $1
            AND v.download_status = 'pending'
          ) as pending_archives
      `, [userId]);

      res.json(stats.rows[0]);
    } catch (error) {
      logger.error('Error fetching discovery stats:', error);
      res.status(500).json({ error: 'Failed to fetch discovery stats' });
    } finally {
      client.release();
    }
  });

  return router;
};

export default createDiscoveryRouter;

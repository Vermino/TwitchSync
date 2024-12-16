// backend/src/routes/discovery/controller.ts

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export class DiscoveryController {
  constructor(private pool: Pool) {}

  getDiscoveryFeed = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      // Get user's discovery preferences
      const preferencesResult = await client.query(
        'SELECT * FROM discovery_preferences WHERE user_id = $1',
        [userId]
      );
      const preferences = preferencesResult.rows[0];

      // Get upcoming premieres based on user's followed channels and games
      const premieresResult = await client.query(`
        WITH user_preferences AS (
          SELECT DISTINCT channel_id, game_id
          FROM user_vod_preferences
          WHERE user_id = $1
        )
        SELECT 
          pe.*,
          c.username as channel_username,
          c.display_name as channel_display_name,
          c.profile_image_url as channel_image,
          g.name as game_name,
          g.box_art_url as game_image,
          v.id as vod_id,
          v.download_status,
          v.download_progress
        FROM premiere_events pe
        JOIN channels c ON pe.channel_id = c.id
        JOIN games g ON pe.game_id = g.id
        LEFT JOIN vods v ON pe.channel_id = v.channel_id 
          AND v.content_type = 'premiere'
          AND v.created_at > pe.detected_at
        WHERE pe.start_time > NOW()
        AND (
          c.id IN (SELECT channel_id FROM user_preferences)
          OR g.id IN (SELECT game_id FROM user_preferences)
        )
        AND pe.predicted_viewers >= $2
        ORDER BY pe.confidence_score DESC, pe.start_time ASC
        LIMIT 10
      `, [userId, preferences.min_viewers]);

      // Get rising channels in user's preferred games
      const risingChannelsResult = await client.query(`
        WITH channel_metrics AS (
          SELECT 
            channel_id,
            AVG(viewer_count) as avg_viewers,
            AVG(viewer_growth_rate) as growth_rate
          FROM channel_metrics
          WHERE recorded_at > NOW() - INTERVAL '7 days'
          GROUP BY channel_id
        ),
        user_preferences AS (
          SELECT DISTINCT game_id
          FROM user_vod_preferences
          WHERE user_id = $1
        )
        SELECT 
          c.*,
          cm.avg_viewers,
          cm.growth_rate,
          g.name as current_game_name,
          g.box_art_url as game_image,
          COUNT(v.id) as recorded_vods,
          STRING_AGG(DISTINCT vp.preferred_quality, ', ') as user_qualities
        FROM channels c
        JOIN channel_metrics cm ON c.id = cm.channel_id
        LEFT JOIN games g ON c.current_game_id = g.id
        LEFT JOIN vods v ON c.id = v.channel_id 
          AND v.download_status IN ('completed', 'downloading')
        LEFT JOIN user_vod_preferences vp ON c.id = vp.channel_id
          AND vp.user_id = $1
        WHERE c.current_game_id IN (SELECT game_id FROM user_preferences)
        AND cm.growth_rate > 0.1
        AND cm.avg_viewers BETWEEN $2 AND $3
        GROUP BY c.id, cm.avg_viewers, cm.growth_rate, g.name, g.box_art_url
        ORDER BY cm.growth_rate DESC
        LIMIT 5
      `, [userId, preferences.min_viewers, preferences.max_viewers]);

      res.json({
        preferences,
        premieres: premieresResult.rows,
        risingChannels: risingChannelsResult.rows
      });
    } catch (error) {
      logger.error('Error fetching discovery feed:', error);
      res.status(500).json({ error: 'Failed to fetch discovery feed' });
    } finally {
      client.release();
    }
  };

  trackPremiereEvent = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      await client.query('BEGIN');

      // Get premiere event details
      const premiereResult = await client.query(
        'SELECT * FROM premiere_events WHERE id = $1',
        [id]
      );

      if (premiereResult.rows.length === 0) {
        res.status(404).json({ error: 'Premiere event not found' });
        return;
      }

      const premiere = premiereResult.rows[0];

      // Get user's VOD preferences for this channel
      const prefsResult = await client.query(`
        SELECT * FROM user_vod_preferences 
        WHERE user_id = $1 AND channel_id = $2`,
        [userId, premiere.channel_id]
      );

      const userPrefs = prefsResult.rows[0] || {
        preferred_quality: 'source',
        download_chat: true,
        download_markers: true,
        download_priority: 'normal',
        retention_days: 30
      };

      // Create or update VOD entry
      const vodResult = await client.query(`
        INSERT INTO vods (
          channel_id,
          game_id,
          user_id,
          content_type,
          status,
          download_status,
          download_priority,
          preferred_quality,
          download_chat,
          download_markers,
          retention_days,
          scheduled_for,
          created_at
        ) VALUES ($1, $2, $3, 'premiere', 'pending', 'queued', $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        ON CONFLICT (channel_id, user_id, content_type) 
        WHERE status = 'pending'
        DO UPDATE SET
          game_id = EXCLUDED.game_id,
          download_priority = EXCLUDED.download_priority,
          scheduled_for = EXCLUDED.scheduled_for
        RETURNING id
      `, [
        premiere.channel_id,
        premiere.game_id,
        userId,
        userPrefs.download_priority,
        userPrefs.preferred_quality,
        userPrefs.download_chat,
        userPrefs.download_markers,
        userPrefs.retention_days,
        premiere.start_time
      ]);

      // Update premiere tracking
      await client.query(`
        INSERT INTO user_premiere_tracking (
          user_id,
          premiere_id,
          vod_id,
          created_at
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      `, [userId, id, vodResult.rows[0].id]);

      await client.query('COMMIT');

      res.json({
        message: 'Premiere event tracked successfully',
        vodId: vodResult.rows[0].id
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error tracking premiere event:', error);
      res.status(500).json({ error: 'Failed to track premiere event' });
    } finally {
      client.release();
    }
  };

  ignorePremiereEvent = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      await client.query('BEGIN');

      // Mark premiere as ignored
      await client.query(`
        INSERT INTO user_premiere_tracking (
          user_id,
          premiere_id,
          ignored,
          created_at
        ) VALUES ($1, $2, true, CURRENT_TIMESTAMP)
      `, [userId, id]);

      // Cancel any pending VOD downloads for this premiere
      await client.query(`
        UPDATE vods 
        SET download_status = 'cancelled',
            error_message = 'Premiere event ignored by user'
        WHERE id IN (
          SELECT vod_id 
          FROM user_premiere_tracking
          WHERE user_id = $1 
          AND premiere_id = $2
        )
        AND download_status IN ('pending', 'queued')
      `, [userId, id]);

      await client.query('COMMIT');
      res.json({ message: 'Premiere event ignored successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error ignoring premiere event:', error);
      res.status(500).json({ error: 'Failed to ignore premiere event' });
    } finally {
      client.release();
    }
  };

  getGameRecommendations = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      const result = await client.query(`
        WITH user_games AS (
          SELECT DISTINCT game_id
          FROM user_vod_preferences
          WHERE user_id = $1
        ),
        game_channel_overlap AS (
          SELECT 
            g.id as game_id,
            COUNT(DISTINCT v.channel_id) as channels_in_common,
            COUNT(DISTINCT CASE WHEN v.download_status = 'completed' THEN v.id END) as recorded_vods
          FROM games g
          JOIN vods v ON g.id = v.game_id
          WHERE v.channel_id IN (
            SELECT channel_id 
            FROM user_vod_preferences 
            WHERE user_id = $1
          )
          GROUP BY g.id
        )
        SELECT 
          g.*,
          gco.channels_in_common,
          gco.recorded_vods,
          COUNT(pe.id) as upcoming_premieres
        FROM games g
        JOIN game_channel_overlap gco ON g.id = gco.game_id
        LEFT JOIN premiere_events pe ON g.id = pe.game_id
          AND pe.start_time > NOW()
        WHERE g.id NOT IN (SELECT game_id FROM user_games)
        GROUP BY g.id, gco.channels_in_common, gco.recorded_vods
        ORDER BY gco.channels_in_common DESC, upcoming_premieres DESC
        LIMIT 10
      `, [userId]);

      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching game recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch game recommendations' });
    } finally {
      client.release();
    }
  };

  getDiscoveryStats = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      const result = await client.query(`
        SELECT
          (
            SELECT COUNT(*)
            FROM premiere_events pe
            WHERE pe.start_time > NOW()
            AND pe.start_time < NOW() + INTERVAL '24 hours'
            AND pe.channel_id IN (
              SELECT channel_id FROM user_vod_preferences WHERE user_id = $1
            )
          ) as upcoming_premieres,
          (
            SELECT COUNT(*)
            FROM vods v
            WHERE v.content_type = 'premiere'
            AND v.user_id = $1
            AND v.download_status IN ('completed', 'downloading')
            AND v.created_at > NOW() - INTERVAL '24 hours'
          ) as recorded_premieres,
          (
            SELECT COUNT(DISTINCT v.channel_id)
            FROM vods v
            WHERE v.user_id = $1
            AND v.download_status = 'completed'
          ) as recorded_channels,
          (
            SELECT COUNT(DISTINCT v.game_id)
            FROM vods v
            WHERE v.user_id = $1
            AND v.download_status = 'completed'
          ) as recorded_games,
          (
            SELECT COUNT(*)
            FROM vods v
            WHERE v.user_id = $1
            AND v.download_status = 'queued'
          ) as pending_downloads
      `, [userId]);

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error fetching discovery stats:', error);
      res.status(500).json({ error: 'Failed to fetch discovery stats' });
    } finally {
      client.release();
    }
  };
}

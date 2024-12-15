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
        SELECT 
          pe.*,
          c.username as channel_username,
          c.display_name as channel_display_name,
          c.profile_image_url as channel_image,
          g.name as game_name,
          g.box_art_url as game_image
        FROM premiere_events pe
        JOIN channels c ON pe.channel_id = c.id
        JOIN games g ON pe.game_id = g.id
        WHERE pe.start_time > NOW()
        AND (
          c.id IN (SELECT channel_id FROM user_channel_preferences WHERE user_id = $1)
          OR g.id IN (SELECT game_id FROM user_game_preferences WHERE user_id = $1)
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
        )
        SELECT 
          c.*,
          cm.avg_viewers,
          cm.growth_rate,
          g.name as current_game_name,
          g.box_art_url as game_image
        FROM channels c
        JOIN channel_metrics cm ON c.id = cm.channel_id
        LEFT JOIN games g ON c.current_game_id = g.id
        WHERE c.current_game_id IN (
          SELECT game_id FROM user_game_preferences WHERE user_id = $1
        )
        AND cm.growth_rate > 0.1
        AND cm.avg_viewers BETWEEN $2 AND $3
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

  getPreferences = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const result = await client.query(
        'SELECT * FROM discovery_preferences WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        // Create default preferences if none exist
        const defaultPreferences = await client.query(`
          INSERT INTO discovery_preferences (
            user_id, min_viewers, max_viewers, preferred_languages,
            content_rating, notify_only, schedule_match, confidence_threshold
          ) VALUES ($1, 100, 50000, ARRAY['EN'], 'all', false, true, 0.7)
          RETURNING *
        `, [userId]);
        res.json(defaultPreferences.rows[0]);
      } else {
        res.json(result.rows[0]);
      }
    } catch (error) {
      logger.error('Error fetching discovery preferences:', error);
      res.status(500).json({ error: 'Failed to fetch discovery preferences' });
    } finally {
      client.release();
    }
  };

  updatePreferences = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
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
          min_viewers = $1,
          max_viewers = $2,
          preferred_languages = $3,
          content_rating = $4,
          notify_only = $5,
          schedule_match = $6,
          confidence_threshold = $7,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $8
        RETURNING *
      `, [
        min_viewers,
        max_viewers,
        preferred_languages,
        content_rating,
        notify_only,
        schedule_match,
        confidence_threshold,
        userId
      ]);

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error updating discovery preferences:', error);
      res.status(500).json({ error: 'Failed to update discovery preferences' });
    } finally {
      client.release();
    }
  };

  getPremieres = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const result = await client.query(`
        SELECT 
          pe.*,
          c.username as channel_username,
          c.display_name as channel_display_name,
          c.profile_image_url as channel_image,
          g.name as game_name,
          g.box_art_url as game_image
        FROM premiere_events pe
        JOIN channels c ON pe.channel_id = c.id
        JOIN games g ON pe.game_id = g.id
        WHERE pe.start_time > NOW()
        AND (
          c.id IN (SELECT channel_id FROM user_channel_preferences WHERE user_id = $1)
          OR g.id IN (SELECT game_id FROM user_game_preferences WHERE user_id = $1)
        )
        ORDER BY pe.start_time ASC
      `, [userId]);

      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching premieres:', error);
      res.status(500).json({ error: 'Failed to fetch premieres' });
    } finally {
      client.release();
    }
  };

  getRisingChannels = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const result = await client.query(`
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
          cm.avg_viewers,
          cm.growth_rate,
          g.name as current_game_name
        FROM channels c
        JOIN channel_metrics cm ON c.id = cm.channel_id
        LEFT JOIN games g ON c.current_game_id = g.id
        WHERE cm.growth_rate > 0.1
        AND c.current_game_id IN (
          SELECT game_id FROM user_game_preferences WHERE user_id = $1
        )
        ORDER BY cm.growth_rate DESC
        LIMIT 10
      `, [userId]);

      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching rising channels:', error);
      res.status(500).json({ error: 'Failed to fetch rising channels' });
    } finally {
      client.release();
    }
  };

  getChannelRecommendations = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;
      const result = await client.query(`
        WITH user_preferences AS (
          SELECT 
            channel_id,
            game_id
          FROM user_channel_preferences
          WHERE user_id = $1
          UNION
          SELECT 
            NULL as channel_id,
            game_id
          FROM user_game_preferences
          WHERE user_id = $1
        ),
        channel_game_overlap AS (
          SELECT 
            c.id as channel_id,
            COUNT(DISTINCT cgh.game_id) as games_in_common
          FROM channels c
          JOIN channel_game_history cgh ON c.id = cgh.channel_id
          WHERE cgh.game_id IN (SELECT game_id FROM user_preferences WHERE game_id IS NOT NULL)
          GROUP BY c.id
        )
        SELECT 
          c.*,
          cgo.games_in_common,
          cm.avg_viewers,
          cm.engagement_rate
        FROM channels c
        JOIN channel_game_overlap cgo ON c.id = cgo.channel_id
        JOIN channel_metrics cm ON c.id = cm.channel_id
        WHERE c.id NOT IN (SELECT channel_id FROM user_preferences WHERE channel_id IS NOT NULL)
        AND cgo.games_in_common >= 3
        ORDER BY cgo.games_in_common DESC, cm.engagement_rate DESC
        LIMIT 10
      `, [userId]);

      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching channel recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch channel recommendations' });
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
          SELECT game_id
          FROM user_game_preferences
          WHERE user_id = $1
        ),
        game_channel_overlap AS (
          SELECT 
            g.id as game_id,
            COUNT(DISTINCT c.id) as channels_in_common
          FROM games g
          JOIN channel_game_history cgh ON g.id = cgh.game_id
          JOIN channels c ON cgh.channel_id = c.id
          WHERE c.id IN (
            SELECT channel_id 
            FROM user_channel_preferences 
            WHERE user_id = $1
          )
          GROUP BY g.id
        )
        SELECT 
          g.*,
          gco.channels_in_common
        FROM games g
        JOIN game_channel_overlap gco ON g.id = gco.game_id
        WHERE g.id NOT IN (SELECT game_id FROM user_games)
        ORDER BY gco.channels_in_common DESC
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

  getTrendingCategories = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        WITH game_metrics AS (
          SELECT 
            g.id,
            g.name,
            g.box_art_url,
            COUNT(DISTINCT pe.id) as premiere_count,
            COUNT(DISTINCT c.id) as active_channels,
            SUM(cm.viewer_count) as total_viewers
          FROM games g
          LEFT JOIN premiere_events pe ON g.id = pe.game_id
          LEFT JOIN channels c ON g.id = c.current_game_id
          LEFT JOIN channel_metrics cm ON c.id = cm.channel_id
          WHERE pe.start_time > NOW() - INTERVAL '24 hours'
          OR cm.recorded_at > NOW() - INTERVAL '24 hours'
          GROUP BY g.id, g.name, g.box_art_url
        )
        SELECT *
        FROM game_metrics
        ORDER BY total_viewers DESC
        LIMIT 10
      `);

      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching trending categories:', error);
      res.status(500).json({ error: 'Failed to fetch trending categories' });
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

      // Create tracking task
      const taskResult = await client.query(`
        INSERT INTO tasks (
          user_id,
          type,
          status,
          config,
          created_at
        ) VALUES ($1, 'PREMIERE', 'PENDING', $2, CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        userId,
        {
          premiereId: premiere.id,
          channelId: premiere.channel_id,
          gameId: premiere.game_id,
          startTime: premiere.start_time,
          quality: 'best',
          retention: 30 // days
        }
      ]);

      // Update premiere event tracking
      await client.query(`
        INSERT INTO user_premiere_tracking (
          user_id,
          premiere_id,
          task_id,
          created_at
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      `, [userId, id, taskResult.rows[0].id]);

      await client.query('COMMIT');

      res.json({ message: 'Premiere event tracked successfully' });
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

      await client.query(`
        INSERT INTO user_premiere_tracking (
          user_id,
          premiere_id,
          ignored,
          created_at
        ) VALUES ($1, $2, true, CURRENT_TIMESTAMP)
      `, [userId, id]);

      res.json({ message: 'Premiere event ignored successfully' });
    } catch (error) {
      logger.error('Error ignoring premiere event:', error);
      res.status(500).json({ error: 'Failed to ignore premiere event' });
    } finally {
      client.release();
    }
  };

  getDiscoveryStats = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const userId = req.user?.id;

      const stats = await client.query(`
        SELECT
          (
            SELECT COUNT(*)
            FROM premiere_events pe
            WHERE pe.start_time > NOW()
            AND pe.start_time < NOW() + INTERVAL '24 hours'
          ) as upcoming_premieres,
          (
            SELECT COUNT(*)
            FROM premiere_events pe
            JOIN user_premiere_tracking upt ON pe.id = upt.premiere_id
            WHERE upt.user_id = $1
            AND upt.created_at > NOW() - INTERVAL '24 hours'
          ) as tracked_premieres,
          (
            SELECT COUNT(*)
            FROM channel_metrics cm
            JOIN channels c ON cm.channel_id = c.id
            WHERE cm.viewer_growth_rate > 0.1
            AND c.current_game_id IN (
              SELECT game_id FROM user_game_preferences WHERE user_id = $1
            )
          ) as rising_channels,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.user_id = $1
            AND t.type = 'PREMIERE'
            AND t.status = 'PENDING'
          ) as pending_archives
      `, [userId]);

      res.json(stats.rows[0]);
    } catch (error) {
      logger.error('Error fetching discovery stats:', error);
      res.status(500).json({ error: 'Failed to fetch discovery stats' });
    } finally {
      client.release();
    }
  };
}

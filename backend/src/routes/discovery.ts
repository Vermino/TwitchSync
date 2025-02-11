// Filepath: backend/src/routes/discovery.ts

import { Router, RequestHandler } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';
import { discoveryService } from '../services/discovery';
import { logger } from '../utils/logger';
import { RequestWithUser } from '../types/auth';
import {
  ChannelRecommendation,
  GameRecommendation,
  DiscoveryStats,
  RecommendationBase,
  Recommendation
} from '../types/discovery';

export const createDiscoveryRouter = (pool: Pool) => {
  const router = Router();
  const discovery = discoveryService(pool);

  // Type guard functions
  const isChannelRecommendation = (rec: RecommendationBase): rec is ChannelRecommendation => {
    return rec.type === 'channel';
  };

  const isGameRecommendation = (rec: RecommendationBase): rec is GameRecommendation => {
    return rec.type === 'game';
  };

  // Get channel recommendations
  const handleChannelRecommendations: RequestHandler = async (req, res) => {
    const userReq = req as RequestWithUser;
    try {
      if (!userReq.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const recommendations = await discovery.getRecommendations(userReq.user.id.toString());
      const channelRecommendations = recommendations
        .filter(isChannelRecommendation)
        .map((rec) => ({
          ...rec,
          tags: rec.tags || []
        }));

      res.json(channelRecommendations);
    } catch (error) {
      logger.error('Error getting channel recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch channel recommendations' });
    }
  };

  // Get game recommendations
  const handleGameRecommendations: RequestHandler = async (req, res) => {
    const userReq = req as RequestWithUser;
    try {
      if (!userReq.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const recommendations = await discovery.getRecommendations(userReq.user.id.toString());
      const gameRecommendations = recommendations
        .filter(isGameRecommendation)
        .map((rec) => ({
          ...rec,
          tags: rec.tags || []
        }));

      res.json(gameRecommendations);
    } catch (error) {
      logger.error('Error getting game recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch game recommendations' });
    }
  };

  // Get premiere stats
  const getPremiereStats: RequestHandler = async (req, res) => {
    try {
      const result = await pool.query(`
        WITH stats AS (
          SELECT
            (SELECT COUNT(*)
             FROM premiere_events 
             WHERE start_time > NOW() - INTERVAL '24 hours') as today_discovered,
             
            (SELECT COUNT(*)
             FROM premiere_events 
             WHERE start_time > NOW()) as upcoming_premieres,
             
            (SELECT COUNT(*)
             FROM user_premiere_tracking) as tracked_premieres,
             
            (SELECT COUNT(DISTINCT cm.channel_id)
             FROM channel_metrics cm
             WHERE cm.viewer_growth_rate > 0.1
             AND cm.recorded_at > NOW() - INTERVAL '24 hours') as rising_channels,
             
            (SELECT COUNT(*)
             FROM vods 
             WHERE status = 'pending') as pending_archives
        )
        SELECT
          COALESCE(today_discovered, 0) as today_discovered,
          COALESCE(upcoming_premieres, 0) as upcoming_premieres,
          COALESCE(tracked_premieres, 0) as tracked_premieres,
          COALESCE(rising_channels, 0) as rising_channels,
          COALESCE(pending_archives, 0) as pending_archives
        FROM stats;
      `);

      const stats: DiscoveryStats = {
        upcomingPremieres: parseInt(result.rows[0].upcoming_premieres),
        trackedPremieres: parseInt(result.rows[0].tracked_premieres),
        risingChannels: parseInt(result.rows[0].rising_channels),
        pendingArchives: parseInt(result.rows[0].pending_archives),
        todayDiscovered: parseInt(result.rows[0].today_discovered)
      };

      res.json(stats);
    } catch (error) {
      logger.error('Error fetching discovery stats:', error);
      res.status(500).json({ error: 'Failed to fetch discovery stats' });
    }
  };

  // Get discovery preferences
  const getPreferences: RequestHandler = async (req, res) => {
    const userReq = req as RequestWithUser;
    try {
      if (!userReq.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await pool.query(`
        SELECT 
          min_viewers,
          max_viewers,
          preferred_languages,
          content_rating,
          notify_only,
          schedule_match,
          confidence_threshold,
          created_at,
          updated_at
        FROM discovery_preferences
        WHERE user_id = $1
      `, [userReq.user.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Preferences not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error fetching discovery preferences:', error);
      res.status(500).json({ error: 'Failed to fetch discovery preferences' });
    }
  };

  // Update discovery preferences
  const updatePreferences: RequestHandler = async (req, res) => {
    const userReq = req as RequestWithUser;
    try {
      if (!userReq.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
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

      // Validate input
      if (min_viewers !== undefined && max_viewers !== undefined && min_viewers > max_viewers) {
        return res.status(400).json({ error: 'min_viewers must be less than max_viewers' });
      }

      if (confidence_threshold !== undefined &&
          (confidence_threshold < 0 || confidence_threshold > 1)) {
        return res.status(400).json({ error: 'confidence_threshold must be between 0 and 1' });
      }

      const result = await pool.query(`
        UPDATE discovery_preferences
        SET
          min_viewers = COALESCE($1, min_viewers),
          max_viewers = COALESCE($2, max_viewers),
          preferred_languages = COALESCE($3, preferred_languages),
          content_rating = COALESCE($4, content_rating),
          notify_only = COALESCE($5, notify_only),
          schedule_match = COALESCE($6, schedule_match),
          confidence_threshold = COALESCE($7, confidence_threshold),
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
        userReq.user.id
      ]);

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error updating discovery preferences:', error);
      res.status(500).json({ error: 'Failed to update discovery preferences' });
    }
  };

  // Route definitions
  router.get(
    '/recommendations/channels',
    authenticate(pool),
    handleChannelRecommendations
  );

  router.get(
    '/recommendations/games',
    authenticate(pool),
    handleGameRecommendations
  );

  router.get(
    '/stats',
    authenticate(pool),
    getPremiereStats
  );

  router.get(
    '/preferences',
    authenticate(pool),
    getPreferences
  );

  router.put(
    '/preferences',
    authenticate(pool),
    updatePreferences
  );

  return router;
};

export default createDiscoveryRouter;

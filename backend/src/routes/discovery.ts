// Filepath: backend/src/routes/discovery.ts

import { Router, RequestHandler } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';
import { discoveryService } from '../services/discovery';
import { logger } from '../utils/logger';
import { RequestWithUser } from '../types/auth';
import { ChannelRecommendation, GameRecommendation } from '../types/discovery';

export const createDiscoveryRouter = (pool: Pool) => {
  const router = Router();
  const discovery = discoveryService(pool);

  // Get channel recommendations
  const handleChannelRecommendations: RequestHandler = async (req, res) => {
    const userReq = req as RequestWithUser;
    try {
      if (!userReq.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const recommendations = await discovery.getRecommendations(userReq.user.id.toString());

      // Filter and map to channel recommendations
      const channelRecommendations: ChannelRecommendation[] = recommendations
        .filter((rec): rec is ChannelRecommendation => rec.type === 'channel')
        .map(rec => ({
          type: 'channel',
          id: rec.id,
          display_name: rec.display_name,
          login: rec.login,
          profile_image_url: rec.profile_image_url,
          description: rec.description,
          viewer_count: rec.viewer_count,
          compatibility_score: rec.compatibility_score
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

      // Filter and map to game recommendations
      const gameRecommendations: GameRecommendation[] = recommendations
        .filter((rec): rec is GameRecommendation => rec.type === 'game')
        .map(rec => ({
          type: 'game',
          id: rec.id,
          game_id: rec.game_id,
          name: rec.name,
          box_art_url: rec.box_art_url,
          compatibility_score: rec.compatibility_score
        }));

      res.json(gameRecommendations);
    } catch (error) {
      logger.error('Error getting game recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch game recommendations' });
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

    router.get('/stats', authenticate(pool), async (req, res) => {
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

        res.json({
          upcomingPremieres: parseInt(result.rows[0].upcoming_premieres),
          trackedPremieres: parseInt(result.rows[0].tracked_premieres),
          risingChannels: parseInt(result.rows[0].rising_channels),
          pendingArchives: parseInt(result.rows[0].pending_archives),
          todayDiscovered: parseInt(result.rows[0].today_discovered)
        });
      } catch (error) {
        logger.error('Error fetching discovery stats:', error);
        res.status(500).json({ error: 'Failed to fetch discovery stats' });
      }
    });

  return router;
};

export default createDiscoveryRouter;

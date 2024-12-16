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

  return router;
};

export default createDiscoveryRouter;

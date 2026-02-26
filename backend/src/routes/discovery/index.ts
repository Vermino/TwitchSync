// Filepath: backend/src/routes/discovery/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import DiscoveryController from './controller';
import { validateRequest, validateQuery } from '../../middleware/validation';
import { authenticate } from '../../middleware/auth';
import {
  DiscoveryPreferencesSchema,
  DiscoveryPreferencesUpdateSchema,
  PremiereTrackingSchema,
  FeedFiltersSchema
} from './validation';
import {
  discoveryFeedLimiter,
  premiereTrackingLimiter,
  preferenceUpdateLimiter
} from '../../middleware/discoveryRateLimiter';
import { errorHandler } from '../../middleware/errorHandler';

import { RequestWithUser } from '../../types/auth'; // Ensure we have the auth type
import { discoveryService } from '../../services/discovery';
import { logger } from '../../utils/logger';

export function createDiscoveryRouter(pool: Pool): Router {
  const router = Router();
  const controller = new DiscoveryController(pool);
  const discovery = discoveryService(pool);

  // Apply authentication to all routes
  router.use(authenticate(pool));

  // Get channel recommendations
  router.get(
    '/recommendations/channels',
    async (req, res) => {
      const userReq = req as RequestWithUser;
      try {
        if (!userReq.user?.id) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const overrides = {
          min_viewers: req.query.min_viewers ? parseInt(req.query.min_viewers as string, 10) : undefined,
          max_viewers: req.query.max_viewers ? parseInt(req.query.max_viewers as string, 10) : undefined,
          preferred_languages: req.query.languages ? (req.query.languages as string).split(',').filter(Boolean) : undefined,
          tags: req.query.tags ? (req.query.tags as string).split(',').filter(Boolean) : undefined,
          confidence_threshold: req.query.confidence_threshold ? parseFloat(req.query.confidence_threshold as string) : undefined
        };

        const channelRecommendations = await discovery.getChannelRecommendations(userReq.user.id.toString(), overrides);
        res.json(channelRecommendations);
      } catch (error) {
        logger.error('Error getting channel recommendations:', error);
        res.status(500).json({ error: 'Failed to fetch channel recommendations' });
      }
    }
  );

  // Get game recommendations
  router.get(
    '/recommendations/games',
    async (req, res) => {
      const userReq = req as RequestWithUser;
      try {
        if (!userReq.user?.id) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const overrides = {
          min_viewers: req.query.min_viewers ? parseInt(req.query.min_viewers as string, 10) : undefined,
          max_viewers: req.query.max_viewers ? parseInt(req.query.max_viewers as string, 10) : undefined,
          preferred_languages: req.query.languages ? (req.query.languages as string).split(',').filter(Boolean) : undefined,
          tags: req.query.tags ? (req.query.tags as string).split(',').filter(Boolean) : undefined,
          confidence_threshold: req.query.confidence_threshold ? parseFloat(req.query.confidence_threshold as string) : undefined
        };

        const gameRecommendations = await discovery.getGameRecommendations(userReq.user.id.toString(), overrides);
        res.json(gameRecommendations);
      } catch (error) {
        logger.error('Error getting game recommendations:', error);
        res.status(500).json({ error: 'Failed to fetch game recommendations' });
      }
    }
  );

  // Get discovery feed with filters
  router.get(
    '/feed',
    discoveryFeedLimiter,
    validateQuery(FeedFiltersSchema),
    controller.getDiscoveryFeed
  );

  // Update discovery preferences (partial updates allowed)
  router.put(
    '/preferences',
    preferenceUpdateLimiter,
    validateRequest(DiscoveryPreferencesUpdateSchema),
    controller.updatePreferences
  );

  // Track a premiere
  router.post(
    '/premieres/track',
    premiereTrackingLimiter,
    validateRequest(PremiereTrackingSchema),
    controller.trackPremiere
  );

  // Get discovery stats
  router.get(
    '/stats',
    discoveryFeedLimiter,
    controller.getDiscoveryStats
  );

  // Ignore a channel (remove from recommendations)
  router.post(
    '/channels/ignore',
    validateRequest(z.object({ body: z.object({ channel_id: z.string().min(1) }) })),
    controller.ignoreChannel
  );

  // Ignore a game (remove from recommendations)
  router.post(
    '/games/ignore',
    validateRequest(z.object({ body: z.object({ game_id: z.string().min(1) }) })),
    controller.ignoreGame
  );

  // Apply error handling middleware
  router.use(errorHandler);

  return router;
}

export default createDiscoveryRouter;

// Filepath: backend/src/routes/discovery/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import DiscoveryController from './controller';
import { validateRequest } from '../../middleware/validation';
import { authenticate } from '../../middleware/auth';
import {
  DiscoveryPreferencesSchema,
  PremiereTrackingSchema,
  FeedFiltersSchema
} from './validation';
import {
  discoveryFeedLimiter,
  premiereTrackingLimiter,
  preferenceUpdateLimiter
} from '../../middleware/discoveryRateLimiter';
import { errorHandler } from '../../middleware/errorHandler';

export function createDiscoveryRouter(pool: Pool): Router {
  const router = Router();
  const controller = new DiscoveryController(pool);

  // Apply authentication to all routes
  router.use(authenticate(pool));

  // Get discovery feed with filters
  router.get(
    '/feed',
    discoveryFeedLimiter,
    validateRequest(FeedFiltersSchema),
    controller.getDiscoveryFeed
  );

  // Update discovery preferences
  router.put(
    '/preferences',
    preferenceUpdateLimiter,
    validateRequest(DiscoveryPreferencesSchema),
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

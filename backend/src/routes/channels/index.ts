// Filepath: backend/src/routes/channels/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import ChannelsController from './controller';
import { validateRequest } from '../../middleware/validation';
import {
  SearchChannelSchema,
  CreateChannelSchema,
  UpdateChannelSchema,
  DeleteChannelSchema
} from './validation';
import {
  channelSearchLimiter,
  channelMutationLimiter,
  channelDeletionLimiter
} from '../../middleware/channelRateLimiter';
import { errorHandler } from '../../middleware/errorHandler';

export function setupChannelRoutes(pool: Pool): Router {
  const router = Router();
  const controller = new ChannelsController(pool);

  // Search route with rate limiting and validation
  router.get('/search',
    channelSearchLimiter,
    validateRequest(SearchChannelSchema),
    controller.searchChannels
  );

  // Get all channels (with optional pagination)
  router.get('/', controller.getAllChannels);

  // Get channel stats
  router.get('/:id/stats',
    validateRequest(DeleteChannelSchema), // Reusing the ID validation schema
    controller.getChannelStats
  );

  // Create new channel with validation and rate limiting
  router.post('/',
    channelMutationLimiter,
    validateRequest(CreateChannelSchema),
    controller.addChannel
  );

  // Update channel
  router.put('/:id',
    channelMutationLimiter,
    validateRequest(UpdateChannelSchema),
    controller.updateChannel
  );

  // Delete channel
  router.delete('/:id',
    channelDeletionLimiter,
    validateRequest(DeleteChannelSchema),
    controller.deleteChannel
  );

  // Apply error handling middleware
  router.use(errorHandler);

  return router;
}

export default setupChannelRoutes;

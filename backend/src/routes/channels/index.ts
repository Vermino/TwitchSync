// Filepath: backend/src/routes/channels/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { ChannelsController } from './controller';
import { validateChannelId } from './validation';

export function setupChannelRoutes(pool: Pool): Router {
  const router = Router();
  const controller = new ChannelsController(pool);

  // Search route
  router.get('/search', controller.searchChannels);

  // Get all channels
  router.get('/', controller.getAllChannels);

  // Create new channel
  router.post('/', async (req, res) => {
    try {
      await controller.addChannel(req, res);
    } catch (error) {
      console.error('Error in channel creation route:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update channel
  router.put('/:id', validateChannelId, controller.updateChannel);

  // Delete channel
  router.delete('/:id', validateChannelId, controller.deleteChannel);

  return router;
}

export default setupChannelRoutes;

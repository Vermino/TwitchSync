import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { ChannelsController } from './controller';
import { validateChannelId } from './validation';

export function setupChannelRoutes(pool: Pool): Router {
  const router = Router();
  const controller = new ChannelsController(pool);

  // Middleware to validate channel ID parameter
  const validateIdParam = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const error = validateChannelId(req.params.id);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    next();
  };

  // Routes
  router.get('/', controller.getAllChannels);
  router.post('/', controller.addChannel);
  router.put('/:id', validateIdParam, controller.updateChannel);
  router.delete('/:id', validateIdParam, controller.deleteChannel);

  return router;
}

export default setupChannelRoutes;

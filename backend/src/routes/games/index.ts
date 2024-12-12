import { Router } from 'express';
import { Pool } from 'pg';
import { GamesController } from './controller';
import { validateGameId } from './validation';

export function setupGameRoutes(pool: Pool): Router {
  const router = Router();
  const controller = new GamesController(pool);

  // Middleware to validate game ID parameter
  const validateIdParam = (req, res, next) => {
    const error = validateGameId(req.params.id);
    if (error) {
      return res.status(400).json({ error });
    }
    next();
  };

  // Routes
  router.get('/', controller.getAllGames);
  router.post('/', controller.addGame);
  router.put('/:id', validateIdParam, controller.updateGame);
  router.delete('/:id', validateIdParam, controller.deleteGame);

  return router;
}

export default setupGameRoutes;

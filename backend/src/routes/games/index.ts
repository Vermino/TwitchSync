// Filepath: backend/src/routes/games/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import GamesController from './controller';
import { validateRequest } from '../../middleware/validation';
import { authenticate } from '../../middleware/auth';
import {
  SearchGameSchema,
  CreateGameSchema,
  UpdateGameSchema,
  DeleteGameSchema,
  GameStatsSchema
} from './validation';
import {
  gameSearchLimiter,
  gameMutationLimiter,
  gameStatsLimiter,
  gameDeletionLimiter
} from '../../middleware/gameRateLimiter';
import { errorHandler } from '../../middleware/errorHandler';

export function setupGameRoutes(pool: Pool): Router {
  const router = Router();
  const controller = new GamesController(pool);

  // Apply authentication to all routes
  router.use(authenticate(pool));

  // Search games with rate limiting and validation
  router.get('/search',
    gameSearchLimiter,
    validateRequest(SearchGameSchema),
    controller.searchGames
  );

  // Get all games with pagination
  router.get('/', controller.getAllGames);

  // Get game stats
  router.get('/:id/stats',
    gameStatsLimiter,
    validateRequest(GameStatsSchema),
    controller.getGameStats
  );

  // Create new game with validation and rate limiting
  router.post('/',
    gameMutationLimiter,
    validateRequest(CreateGameSchema),
    controller.addGame
  );

  // Update game
  router.put('/:id',
    gameMutationLimiter,
    validateRequest(UpdateGameSchema),
    controller.updateGame
  );

  // Delete (deactivate) game
  router.delete('/:id',
    gameDeletionLimiter,
    validateRequest(DeleteGameSchema),
    controller.deleteGame
  );

  // Apply error handling middleware
  router.use(errorHandler);

  return router;
}

export default setupGameRoutes;

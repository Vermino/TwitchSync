// Filepath: backend/src/routes/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { setupChannelRoutes } from './channels';
import { setupGameRoutes } from './games';
import { setupDashboardRoutes } from './dashboard';
import { setupAuthRoutes } from './auth';
import { setupSystemRoutes } from './system';
import { setupSettingsRoutes } from './settings';
import { setupTaskRoutes } from './tasks';
import { setupTwitchSearchRoutes } from './twitch/search';
import { setupVodRoutes } from './vods';
import createDiscoveryRouter from './discovery';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

export function setupRoutes(pool: Pool): Router {
  const router = Router();

  // Log middleware for debugging routes
  router.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // Public routes
  router.use('/auth', setupAuthRoutes(pool));

  // Protected routes
  const protectedRoutes = [
    { path: '/channels', handler: setupChannelRoutes },
    { path: '/games', handler: setupGameRoutes },
    { path: '/dashboard', handler: setupDashboardRoutes },
    { path: '/system', handler: setupSystemRoutes },
    { path: '/settings', handler: setupSettingsRoutes },
    { path: '/tasks', handler: setupTaskRoutes },
    { path: '/twitch', handler: setupTwitchSearchRoutes },
    { path: '/vods', handler: setupVodRoutes },
    { path: '/discovery', handler: createDiscoveryRouter }
  ];

  // Set up protected routes
  protectedRoutes.forEach(({ path, handler }) => {
    router.use(path, authenticate(pool), handler(pool));
    logger.debug(`Registered route: ${path}`);
  });

  // 404 handler
  router.use((req, res) => {
    logger.warn(`Route not found: ${req.method} ${req.path}`);
    res.status(404).json({ error: 'Route not found' });
  });

  return router;
}

export {
  setupAuthRoutes,
  setupChannelRoutes,
  setupGameRoutes,
  setupDashboardRoutes,
  setupSystemRoutes,
  setupSettingsRoutes,
  setupTaskRoutes,
  setupTwitchSearchRoutes,
  setupVodRoutes,
  createDiscoveryRouter as setupDiscoveryRoutes
};

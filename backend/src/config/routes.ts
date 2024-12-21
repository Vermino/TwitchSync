// Filepath: backend/src/config/routes.ts

import { Application } from 'express';
import { Pool } from 'pg';
import { setupRoutes, setupAuthRoutes } from '../routes';
import { logger } from '../utils/logger';

export function setupAppRoutes(app: Application, pool: Pool) {
  // Health check routes
  app.get('/', (req, res) => {
    res.json({
      message: 'TwitchSync API Server',
      status: 'running',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV
    });
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Mount auth routes at root level only
  // We'll modify the frontend to use this path
  app.use('/api/auth', setupAuthRoutes(pool));

  // Set up all other API routes
  app.use('/api', setupRoutes(pool));

  // 404 handler
  app.use((req, res) => {
    logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.originalUrl} not found`
    });
  });

  return app;
}

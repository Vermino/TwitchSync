// Filepath: backend/src/config/middleware.ts

import { Application } from 'express';
import { Pool } from 'pg';
import { loggingMiddleware } from '../middleware/logging';
import { debugMiddleware } from '../middleware/debug';
import { errorHandler } from '../middleware/errorHandler';

export function setupMiddleware(app: Application, pool: Pool) {
  // Standard middleware
  app.use(loggingMiddleware);

  // Development-only middleware
  if (process.env.NODE_ENV === 'development') {
    app.use(debugMiddleware);
  }

  // Error handling middleware - should be last
  app.use(errorHandler);

  return app;
}

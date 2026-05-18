// Filepath: backend/src/middleware/debug.ts

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const debugMiddleware = (req: Request, res: Response, next: NextFunction) => {
  logger.debug('Request debug info:', {
    method: req.method,
    url: req.url,
    path: req.path,
    params: req.params,
    query: req.query,
    body: req.body,
    headers: {
      'content-type': req.get('content-type'),
      'authorization': req.get('authorization') ? '[REDACTED]' : undefined,
      'origin': req.get('origin')
    }
  });
  next();
};

// Filepath: backend/src/middleware/logging.ts

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// Extend Express Request to include our custom properties
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime?: number;
    }
  }
}

export const loggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = uuidv4();
  req.requestId = requestId;
  req.startTime = Date.now();

  // Log request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || 0);
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('content-length')
    });
  });

  next();
};

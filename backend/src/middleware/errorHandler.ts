// backend/src/middleware/errorHandler.ts

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  details?: any;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    details: err.details,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  });

  // Default to 500 if statusCode not set
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'An unexpected error occurred' : err.message;

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { details: err.details })
  });
}

// Example usage in a controller:
/*
export class TasksController {
  constructor(private pool: Pool) {}

  createTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await withTransaction(this.pool, async (client) => {
        // Your transaction logic here
        const { rows } = await client.query('INSERT INTO tasks ...');
        return rows[0];
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };
}
*/

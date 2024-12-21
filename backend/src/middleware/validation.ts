// Filepath: backend/src/middleware/validation.ts

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';

export class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
  statusCode: number;
}

export const validateRequest = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params
      });

      // Replace request data with validated data
      req.body = validatedData.body;
      req.query = validatedData.query;
      req.params = validatedData.params;

      next();
    } catch (error) {
      logger.error('Validation error:', error);
      if (error instanceof z.ZodError) {
        next(new ValidationError('Validation failed', error.errors));
      } else {
        next(error);
      }
    }
  };
};

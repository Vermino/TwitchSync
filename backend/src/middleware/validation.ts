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
      // Validate just the body directly instead of wrapping it
      const validatedData = await schema.parseAsync(req.body);

      // Update the request body with the validated data
      req.body = validatedData;

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

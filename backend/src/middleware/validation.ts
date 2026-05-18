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
      // For body validation schemas, validate just the body
      const validatedData = await schema.parseAsync(req.body);
      
      // Update request body with validated data
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

// For validating request params
export const validateParams = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = await schema.parseAsync(req.params);
      req.params = validatedData;
      next();
    } catch (error) {
      logger.error('Params validation error:', error);
      if (error instanceof z.ZodError) {
        next(new ValidationError('Parameter validation failed', error.errors));
      } else {
        next(error);
      }
    }
  };
};

// For validating query parameters
export const validateQuery = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = await schema.parseAsync(req.query);
      req.query = validatedData;
      next();
    } catch (error) {
      logger.error('Query validation error:', error);
      if (error instanceof z.ZodError) {
        next(new ValidationError('Query validation failed', error.errors));
      } else {
        next(error);
      }
    }
  };
};

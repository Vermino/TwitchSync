// backend/src/middleware/taskOwnership.ts

import { Response, NextFunction } from 'express';
import { RequestWithUser } from '../types/auth';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

export class ResourceNotFoundError extends Error {
  constructor(resource: string, id: string | number) {
    super(`${resource} not found with id: ${id}`);
    this.name = 'ResourceNotFoundError';
    this.statusCode = 404;
  }
  statusCode: number;
}

export const verifyTaskOwnership = (pool: Pool) => {
  return async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params.id;
      const userId = req.userId;

      if (!userId) {
        throw new Error('User ID not found in request');
      }

      const taskCheck = await pool.query(
        'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
        [taskId, userId]
      );

      if (!taskCheck.rows.length) {
        throw new ResourceNotFoundError('Task', taskId);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

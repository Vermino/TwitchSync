import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        twitch_id?: string;
      };
    }
  }
}

export const authenticate = (pool: Pool) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'Invalid token format' });
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number; twitch_id?: string };

        // Verify user exists in database
        const result = await pool.query(
          'SELECT id, twitch_id FROM users WHERE id = $1',
          [decoded.id]
        );

        if (result.rows.length === 0) {
          return res.status(401).json({ error: 'User not found' });
        }

        req.user = {
          id: decoded.id,
          twitch_id: decoded.twitch_id
        };

        next();
      } catch (error) {
        logger.error('Token verification failed:', error);
        return res.status(401).json({ error: 'Invalid token' });
      }
    } catch (error) {
      logger.error('Authentication middleware error:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  };
};

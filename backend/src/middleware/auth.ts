import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { authService } from '../services/auth';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        email: string | null;
      };
    }
  }
}

export const authenticate = (pool: Pool) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const user = await authService(pool).validateSession(token);

      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      req.user = {
        id: user.id,
        username: user.username,
        email: user.email
      };

      next();
    } catch (error) {
      logger.error('Auth middleware error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  };
};

export const requireTwitchAuth = (pool: Pool) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { twitchAccount } = await authService(pool).getUserWithTwitchAccount(req.user.id);

      if (!twitchAccount) {
        return res.status(403).json({ error: 'Twitch authentication required' });
      }

      // Refresh token if needed
      await authService(pool).refreshTokenIfNeeded(req.user.id);

      next();
    } catch (error) {
      logger.error('Twitch auth middleware error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  };
};

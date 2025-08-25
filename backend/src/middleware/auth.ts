// Filepath: backend/src/middleware/auth.ts

import { Request, Response, NextFunction } from 'express';
import { Pool, QueryResult } from 'pg';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

// Define database user interface
interface DatabaseUser {
  id: number;
  twitch_id: string | null;
  username: string;
  email: string | null;
  created_at: Date;
  updated_at: Date;
}

// Define the JWT token payload structure
interface TokenPayload {
  userId: number;
  twitchId: string | null;
  username: string;
  exp: number;
}

// Define the shared user interface
export interface TwitchSyncUser {
  id: string;
  twitch_id?: string;
}

// Update the global Express namespace
declare global {
  namespace Express {
    interface Request {
      user?: TwitchSyncUser;
    }
  }
}

/**
 * Authentication middleware factory
 * @param pool - Database connection pool
 * @returns Express middleware function
 */
export const authenticate = (pool: Pool) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      // Extract and validate auth header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'No authentication token provided'
        });
      }

      // Extract and validate token
      const [bearer, token] = authHeader.split(' ');
      if (bearer !== 'Bearer' || !token) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid token format'
        });
      }

      try {
        // Verify token
        const jwtSecret = process.env.JWT_SECRET || 'development-secret';
        const decoded = jwt.verify(token, jwtSecret) as TokenPayload;

        // Check token expiration
        const expirationTime = decoded.exp * 1000;
        const currentTime = Date.now();
        const timeUntilExpiration = expirationTime - currentTime;
        const refreshThreshold = 5 * 60 * 1000; // 5 minutes

        // Refresh token if it's about to expire
        if (timeUntilExpiration < refreshThreshold) {
          const client = await pool.connect();
          try {
            // Get user from database
            const userResult: QueryResult<DatabaseUser> = await client.query(
              'SELECT * FROM users WHERE id = $1',
              [decoded.userId]
            );

            if (userResult.rows.length === 0) {
              return res.status(401).json({
                error: 'Unauthorized',
                message: 'User not found'
              });
            }

            const user = userResult.rows[0];

            // Generate new token
            const newToken = jwt.sign(
              {
                userId: user.id,
                twitchId: user.twitch_id,
                username: user.username
              },
              jwtSecret,
              { expiresIn: '1d' }
            );

            // Set new token in response header
            res.setHeader('X-New-Token', newToken);
          } finally {
            client.release();
          }
        }

        // Set user data in request
        const userData: TwitchSyncUser = {
          id: decoded.userId.toString(),
          twitch_id: decoded.twitchId || undefined
        };

        req.user = userData;

        // Continue to next middleware
        next();
      } catch (jwtError) {
        if (jwtError instanceof jwt.TokenExpiredError) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Token has expired'
          });
        }

        if (jwtError instanceof jwt.JsonWebTokenError) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid token'
          });
        }

        // Rethrow unexpected errors
        throw jwtError;
      }
    } catch (error) {
      // Log and handle any unexpected errors
      logger.error('Authentication error:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred during authentication'
      });
    }
  };
};

// Filepath: backend/src/middleware/rateLimiter.ts

import rateLimit from 'express-rate-limit';
import { RedisStore, SendCommandFn } from 'rate-limit-redis';
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { Request } from 'express';

type RedisReply = string | number | null;

// Initialize store object
let store: RedisStore | undefined;

// Initialize Redis if configuration is available
if (process.env.REDIS_URL) {
  try {
    const redis = new Redis(process.env.REDIS_URL);

    // Create properly typed sendCommand function
    const sendCommand = (async (...args: string[]): Promise<RedisReply> => {
      try {
        const [command, ...params] = args;
        const result = await redis.call(command, ...params);

        // Ensure we return a compatible type
        if (typeof result === 'string' || typeof result === 'number' || result === null) {
          return result;
        }
        // Convert other types to string
        return String(result);
      } catch (error) {
        logger.error('Redis command error:', error);
        throw error;
      }
    }) as SendCommandFn;

    store = new RedisStore({
      sendCommand,
      prefix: 'rl:'
    });

    logger.info('Rate limiter using Redis store');
  } catch (error) {
    logger.error('Failed to initialize Redis store for rate limiter:', error);
  }
}

// Rate limiter configuration
export const rateLimiter = rateLimit({
  store,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Please try again later'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers

  // Skip rate limiting for certain paths
  skip: (req: Request): boolean => {
    const skipPaths = ['/health', '/auth/callback'];
    return skipPaths.includes(req.path);
  },

  // Generate key based on user ID or IP
  keyGenerator: (req: Request): string => {
    // If user is authenticated, use user ID, otherwise use IP
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    // Ensure we always return a valid string
    return req.ip || 'unknown';
  },

  // Handle rate limit exceeded
  handler: (req, res) => {
    logger.warn('Rate limit exceeded:', {
      ip: req.ip,
      userId: req.user?.id,
      path: req.path
    });

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Specific rate limiter for more sensitive endpoints
export const strictRateLimiter = rateLimit({
  ...rateLimiter,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 requests per hour
  message: {
    error: 'Too many requests',
    message: 'Access to this resource is limited. Please try again later.'
  }
});

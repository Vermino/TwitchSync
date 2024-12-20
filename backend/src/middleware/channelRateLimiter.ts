// Filepath: backend/src/middleware/channelRateLimiter.ts

import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

// Rate limiter for channel search
export const channelSearchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per minute
  message: {
    error: 'Too many search requests',
    message: 'Please try again after 1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for channel search', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.id
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many search attempts, please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Rate limiter for channel creation/update
export const channelMutationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // limit each IP to 20 mutations per 5 minutes
  message: {
    error: 'Too many channel modifications',
    message: 'Please try again after 5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for channel mutation', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.id,
      method: req.method
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many modification attempts, please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Rate limiter for channel deletion
export const channelDeletionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 deletions per hour
  message: {
    error: 'Too many deletion requests',
    message: 'Please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for channel deletion', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.id
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many deletion attempts, please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

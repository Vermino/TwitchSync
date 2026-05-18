// Filepath: backend/src/middleware/gameRateLimiter.ts

import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

// Rate limiter for game search
export const gameSearchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per minute
  message: {
    error: 'Too many search requests',
    message: 'Please try again after 1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for game search', {
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

// Rate limiter for game creation/update
export const gameMutationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // limit each IP to 20 mutations per 5 minutes
  message: {
    error: 'Too many game modifications',
    message: 'Please try again after 5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for game mutation', {
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

// Rate limiter for game stats
export const gameStatsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per minute
  message: {
    error: 'Too many stats requests',
    message: 'Please try again after 1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for game stats', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.id
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many stats requests, please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Rate limiter for game deletion
export const gameDeletionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 deletions per hour
  message: {
    error: 'Too many deletion requests',
    message: 'Please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for game deletion', {
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

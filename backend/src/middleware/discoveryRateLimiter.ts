// Filepath: backend/src/middleware/discoveryRateLimiter.ts

import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

// Rate limiter for discovery feed requests
export const discoveryFeedLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 requests per minute
  message: {
    error: 'Too many feed requests',
    message: 'Please try again after 1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for discovery feed', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.id
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many feed requests, please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Rate limiter for tracking premieres
export const premiereTrackingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // limit each IP to 30 tracking requests per 5 minutes
  message: {
    error: 'Too many tracking requests',
    message: 'Please try again after 5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for premiere tracking', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.id
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many tracking requests, please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Rate limiter for discovery preference updates
export const preferenceUpdateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 updates per 15 minutes
  message: {
    error: 'Too many preference updates',
    message: 'Please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for preference updates', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.id
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many preference updates, please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Filepath: backend/src/middleware/authRateLimiter.ts

import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

// Rate limiter for login attempts
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per window
  message: {
    error: 'Too many login attempts',
    message: 'Please try again after 15 minutes'
  },
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for login', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many login attempts, please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Rate limiter for token refresh attempts
export const tokenRefreshRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // limit each IP to 30 refresh attempts per hour
  message: {
    error: 'Too many token refresh attempts',
    message: 'Please try again after an hour'
  },
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for token refresh', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many token refresh attempts, please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Rate limiter for Twitch callback attempts
export const callbackRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 10 callback attempts per window
  message: {
    error: 'Too many callback attempts',
    message: 'Please try again after 5 minutes'
  },
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for auth callback', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many callback attempts, please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

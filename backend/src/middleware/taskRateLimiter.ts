// Filepath: backend/src/middleware/taskRateLimiter.ts

import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

// Rate limiter for task creation/update
export const taskMutationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // limit each IP to 30 mutations per 5 minutes
  message: {
    error: 'Too many task modifications',
    message: 'Please try again after 5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for task mutation', {
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

// Rate limiter for task execution
export const taskExecutionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 executions per minute
  message: {
    error: 'Too many task executions',
    message: 'Please try again after 1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for task execution', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.id,
      taskId: req.params.id
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many execution attempts, please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

// Rate limiter for task deletion
export const taskDeletionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 deletions per hour
  message: {
    error: 'Too many task deletions',
    message: 'Please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for task deletion', {
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

// Rate limiter for task history
export const taskHistoryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 history requests per minute
  message: {
    error: 'Too many history requests',
    message: 'Please try again after 1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for task history', {
      ip: req.ip,
      path: req.path,
      userId: req.user?.id
    });
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many history requests, please try again later',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

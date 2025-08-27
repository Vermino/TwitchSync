// Filepath: backend/src/routes/queue/validation.ts

import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const validatePriorityUpdate = [
  body('priority')
    .isIn(['low', 'normal', 'high', 'critical'])
    .withMessage('Priority must be one of: low, normal, high, critical'),
  
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];

export const validateBulkPriorityUpdate = [
  body('updates')
    .isArray({ min: 1 })
    .withMessage('Updates must be a non-empty array'),
  
  body('updates.*.vod_id')
    .isInt({ min: 1 })
    .withMessage('VOD ID must be a positive integer'),
  
  body('updates.*.priority')
    .isIn(['low', 'normal', 'high', 'critical'])
    .withMessage('Priority must be one of: low, normal, high, critical'),
  
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Additional validation for bulk updates
    const { updates } = req.body;
    if (updates.length > 100) {
      return res.status(400).json({
        error: 'Validation failed',
        details: [{ msg: 'Cannot update more than 100 VODs at once' }]
      });
    }

    next();
  }
];

export const validateRetry = [
  body('reset_retry_count')
    .optional()
    .isBoolean()
    .withMessage('reset_retry_count must be a boolean'),
  
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }
    next();
  }
];

export const validateQueueQuery = [
  // Optional query parameter validation can be added here
  (req: Request, res: Response, next: NextFunction) => {
    const { status, limit, offset, task_id } = req.query;

    // Validate status filter
    if (status && typeof status === 'string') {
      const validStatuses = ['pending', 'queued', 'downloading', 'completed', 'failed', 'cancelled', 'archived'];
      const statusList = status.split(',');
      const invalidStatuses = statusList.filter(s => !validStatuses.includes(s));
      
      if (invalidStatuses.length > 0) {
        return res.status(400).json({
          error: 'Invalid status values',
          details: `Invalid status values: ${invalidStatuses.join(', ')}`
        });
      }
    }

    // Validate limit
    if (limit) {
      const limitNum = parseInt(limit as string);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 500) {
        return res.status(400).json({
          error: 'Invalid limit',
          details: 'Limit must be between 1 and 500'
        });
      }
    }

    // Validate offset
    if (offset) {
      const offsetNum = parseInt(offset as string);
      if (isNaN(offsetNum) || offsetNum < 0) {
        return res.status(400).json({
          error: 'Invalid offset',
          details: 'Offset must be 0 or greater'
        });
      }
    }

    // Validate task_id
    if (task_id) {
      const taskIdNum = parseInt(task_id as string);
      if (isNaN(taskIdNum) || taskIdNum < 1) {
        return res.status(400).json({
          error: 'Invalid task_id',
          details: 'task_id must be a positive integer'
        });
      }
    }

    next();
  }
];
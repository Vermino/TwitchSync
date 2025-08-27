// Filepath: backend/src/routes/queue/index.ts

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../../middleware/auth';
import { 
  getDownloadQueue, 
  getQueueHistory, 
  getQueueStats, 
  updateVodPriority,
  retryFailedVod,
  bulkUpdatePriority,
  clearCompletedVods,
  moveVodToTop,
  moveVodToBottom,
  getQueueEstimate,
  executeBulkAction
} from './operations';
import { 
  validatePriorityUpdate, 
  validateBulkPriorityUpdate,
  validateRetry
} from './validation';
import { logger } from '../../utils/logger';

export function setupQueueRoutes(pool: Pool): Router {
  const router = Router();

  // Get current download queue (pending/queued/downloading only)
  router.get('/', authenticate(pool), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const { status, limit, offset } = req.query;
      const statusFilter = status ? String(status).split(',') : ['pending', 'queued', 'downloading'];
      const limitNum = limit ? parseInt(String(limit), 10) : 50;
      const offsetNum = offset ? parseInt(String(offset), 10) : 0;

      const queue = await getDownloadQueue(pool, Number(userId), statusFilter, limitNum, offsetNum);
      res.json(queue);
    } catch (error) {
      logger.error('Error fetching download queue:', error);
      res.status(500).json({ error: 'Failed to fetch download queue' });
    }
  });

  // Get queue history (completed/failed VODs)
  router.get('/history', authenticate(pool), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const { status, limit, offset, task_id } = req.query;
      const statusFilter = status ? String(status).split(',') : ['completed', 'failed'];
      const limitNum = limit ? parseInt(String(limit), 10) : 50;
      const offsetNum = offset ? parseInt(String(offset), 10) : 0;
      const taskId = task_id ? parseInt(String(task_id), 10) : undefined;

      const history = await getQueueHistory(pool, Number(userId), statusFilter, limitNum, offsetNum, taskId);
      res.json(history);
    } catch (error) {
      logger.error('Error fetching queue history:', error);
      res.status(500).json({ error: 'Failed to fetch queue history' });
    }
  });

  // Get queue statistics
  router.get('/stats', authenticate(pool), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const { task_id } = req.query;
      const taskId = task_id ? parseInt(String(task_id), 10) : undefined;
      
      const stats = await getQueueStats(pool, Number(userId), taskId);
      res.json(stats);
    } catch (error) {
      logger.error('Error fetching queue stats:', error);
      res.status(500).json({ error: 'Failed to fetch queue stats' });
    }
  });

  // Update VOD priority in queue
  router.patch('/:id/priority', authenticate(pool), validatePriorityUpdate, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const vodId = parseInt(req.params.id, 10);
      const { priority } = req.body;

      const result = await updateVodPriority(pool, vodId, Number(userId), priority);
      if (!result) {
        return res.status(404).json({ error: 'VOD not found or access denied' });
      }

      res.json({ message: 'VOD priority updated successfully', vod: result });
    } catch (error) {
      logger.error('Error updating VOD priority:', error);
      res.status(500).json({ error: 'Failed to update VOD priority' });
    }
  });

  // Bulk update priorities
  router.patch('/bulk/priority', authenticate(pool), validateBulkPriorityUpdate, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const { updates } = req.body;
      const results = await bulkUpdatePriority(pool, updates, Number(userId));
      
      res.json({ 
        message: 'Bulk priority update completed', 
        updated: results.length,
        results 
      });
    } catch (error) {
      logger.error('Error bulk updating VOD priorities:', error);
      res.status(500).json({ error: 'Failed to bulk update VOD priorities' });
    }
  });

  // Retry failed download
  router.post('/:id/retry', authenticate(pool), validateRetry, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const vodId = parseInt(req.params.id, 10);
      const { reset_retry_count } = req.body;

      const result = await retryFailedVod(pool, vodId, Number(userId), reset_retry_count);
      if (!result) {
        return res.status(404).json({ error: 'VOD not found, access denied, or not in failed state' });
      }

      res.json({ message: 'VOD retry initiated successfully', vod: result });
    } catch (error) {
      logger.error('Error retrying VOD download:', error);
      res.status(500).json({ error: 'Failed to retry VOD download' });
    }
  });

  // Move VOD to top of queue (set to critical priority)
  router.post('/:id/move-top', authenticate(pool), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const vodId = parseInt(req.params.id, 10);
      const result = await moveVodToTop(pool, vodId, Number(userId));
      
      if (!result) {
        return res.status(404).json({ error: 'VOD not found or not in queue' });
      }

      res.json({ message: 'VOD moved to top of queue', vod: result });
    } catch (error) {
      logger.error('Error moving VOD to top:', error);
      res.status(500).json({ error: 'Failed to move VOD to top of queue' });
    }
  });

  // Move VOD to bottom of queue (set to low priority)
  router.post('/:id/move-bottom', authenticate(pool), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const vodId = parseInt(req.params.id, 10);
      const result = await moveVodToBottom(pool, vodId, Number(userId));
      
      if (!result) {
        return res.status(404).json({ error: 'VOD not found or not in queue' });
      }

      res.json({ message: 'VOD moved to bottom of queue', vod: result });
    } catch (error) {
      logger.error('Error moving VOD to bottom:', error);
      res.status(500).json({ error: 'Failed to move VOD to bottom of queue' });
    }
  });

  // Clear completed VODs from history
  router.delete('/history/completed', authenticate(pool), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const { task_id } = req.query;
      const taskId = task_id ? parseInt(String(task_id), 10) : undefined;
      
      const result = await clearCompletedVods(pool, Number(userId), taskId);
      res.json({ 
        message: `Cleared ${result.deleted} completed VODs from history`,
        deleted: result.deleted 
      });
    } catch (error) {
      logger.error('Error clearing completed VODs:', error);
      res.status(500).json({ error: 'Failed to clear completed VODs' });
    }
  });

  // Get queue time estimates
  router.get('/estimate', authenticate(pool), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const { task_id } = req.query;
      const taskId = task_id ? parseInt(String(task_id), 10) : undefined;
      
      const estimate = await getQueueEstimate(pool, Number(userId), taskId);
      res.json(estimate);
    } catch (error) {
      logger.error('Error getting queue estimate:', error);
      res.status(500).json({ error: 'Failed to get queue estimate' });
    }
  });

  // Execute bulk operations
  router.post('/bulk', authenticate(pool), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const action = req.body;
      
      // Basic validation
      if (!action || !action.type) {
        return res.status(400).json({ error: 'Invalid bulk action: type is required' });
      }

      const validTypes = ['pause_all', 'resume_all', 'clear_completed', 'set_priority', 'cancel_all'];
      if (!validTypes.includes(action.type)) {
        return res.status(400).json({ error: `Invalid bulk action type: ${action.type}` });
      }

      if (action.type === 'set_priority' && !action.priority) {
        return res.status(400).json({ error: 'Priority is required for set_priority action' });
      }

      const result = await executeBulkAction(pool, action, Number(userId));
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      logger.error('Error executing bulk action:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to execute bulk action',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  });

  return router;
}

export default setupQueueRoutes;
// Filepath: backend/src/routes/vods/index.ts

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../../middleware/auth';
import { VOD } from '../../types/vod';
import { withTransaction } from '../../middleware/withTransaction';
import { logger } from '../../utils/logger';

export function setupVodRoutes(pool: Pool): Router {
  const router = Router();

  // Get all VODs for the authenticated user with optional filtering
  // Enhanced to work as both general VOD listing and queue-focused endpoint
  router.get('/', authenticate(pool), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const client = await pool.connect();
    try {
      const result = await withTransaction(pool, async (client) => {
        const { status, task_id, limit, offset } = req.query;
        
        // Build WHERE clause based on filters
        let whereClause = 'WHERE t.user_id = $1';
        const params: any[] = [parseInt(userId, 10)];
        let paramIndex = 2;

        // Add status filter if provided - supports queue segregation
        if (status && typeof status === 'string') {
          const statusList = status.split(',');
          // Validate status values to prevent SQL injection
          const validStatuses = ['pending', 'queued', 'downloading', 'completed', 'failed', 'cancelled', 'archived'];
          const filteredStatuses = statusList.filter(s => validStatuses.includes(s));
          
          if (filteredStatuses.length > 0) {
            whereClause += ` AND v.download_status = ANY($${paramIndex})`;
            params.push(filteredStatuses);
            paramIndex++;
          }
        }

        // Add task filter if provided
        if (task_id) {
          whereClause += ` AND t.id = $${paramIndex}`;
          params.push(parseInt(task_id as string));
          paramIndex++;
        }

        // Add limit and offset
        const limitNum = limit ? parseInt(limit as string) : 100;
        const offsetNum = offset ? parseInt(offset as string) : 0;

        const vodsQuery = await client.query<VOD>(`
          SELECT 
            v.*,
            t.name as task_name,
            t.user_id as task_user_id,
            c.username as channel_name,
            g.name as game_name,
            t.status as task_status,
            cv.completed_at as actual_completed_at,
            cv.file_size_bytes as actual_file_size,
            cv.download_speed_mbps,
            cv.download_duration_seconds,
            -- Add queue position for active queue items
            CASE 
              WHEN v.download_status IN ('pending', 'queued', 'downloading') THEN
                ROW_NUMBER() OVER (
                  ORDER BY 
                    CASE v.download_status
                      WHEN 'downloading' THEN 1
                      WHEN 'queued' THEN 2  
                      WHEN 'pending' THEN 3
                      ELSE 4
                    END,
                    CASE v.download_priority 
                      WHEN 'critical' THEN 1
                      WHEN 'high' THEN 2 
                      WHEN 'normal' THEN 3
                      WHEN 'low' THEN 4
                      ELSE 5
                    END,
                    v.created_at ASC
                )
              ELSE NULL
            END as queue_position
          FROM vods v
          LEFT JOIN tasks t ON v.task_id = t.id
          LEFT JOIN channels c ON v.channel_id = c.id
          LEFT JOIN games g ON v.game_id = g.id
          LEFT JOIN completed_vods cv ON v.id = cv.vod_id
          ${whereClause}
          ORDER BY 
            CASE v.download_status
              WHEN 'downloading' THEN 1
              WHEN 'queued' THEN 2
              WHEN 'pending' THEN 3
              WHEN 'failed' THEN 4
              WHEN 'completed' THEN 5
              ELSE 6
            END,
            CASE v.download_priority 
              WHEN 'critical' THEN 1
              WHEN 'high' THEN 2 
              WHEN 'normal' THEN 3
              WHEN 'low' THEN 4
              ELSE 5
            END,
            v.created_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `, [...params, limitNum, offsetNum]);

        // Return VODs directly - download_progress is already in the vods table
        return vodsQuery.rows;
      });

      res.json(result);
    } catch (error) {
      logger.error('Error fetching VODs:', error);
      res.status(500).json({ error: 'Failed to fetch VODs' });
    } finally {
      client.release();
    }
  });

  // Delete a VOD
  router.delete('/:id', authenticate(pool), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      await withTransaction(pool, async (client) => {
        const vodId = parseInt(req.params.id);

        // Verify ownership
        const verifyQuery = await client.query(`
          SELECT v.id
          FROM vods v
          JOIN tasks t ON v.task_id = t.id
          WHERE v.id = $1 AND t.user_id = $2
        `, [vodId, userId]);

        if (verifyQuery.rows.length === 0) {
          throw new Error('VOD not found or access denied');
        }

        // Delete the VOD
        await client.query('DELETE FROM vods WHERE id = $1', [vodId]);
      });

      res.json({ message: 'VOD deleted successfully' });
    } catch (error) {
      logger.error('Error deleting VOD:', error);
      res.status(500).json({ error: 'Failed to delete VOD' });
    }
  });

  return router;
}

export default setupVodRoutes;

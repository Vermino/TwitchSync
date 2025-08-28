// Filepath: backend/src/routes/queue/operations.ts

import { Pool, PoolClient } from 'pg';
import { withTransaction } from '../../middleware/withTransaction';
import { VOD } from '../../types/vod';
import { QueueItem, QueueStats, PriorityUpdate, QueueResponse, BulkAction, QueueOperationResult } from '../../types/queue';
import { logger } from '../../utils/logger';

/**
 * Get current download queue (active downloads only)
 */
export async function getDownloadQueue(
  pool: Pool,
  userId: number,
  statusFilter: string[] = ['pending', 'queued', 'downloading'],
  limit: number = 50,
  offset: number = 0
): Promise<QueueResponse> {
  return withTransaction(pool, async (client) => {
    // First get total count
    const countResult = await client.query(`
      SELECT COUNT(*) as total
      FROM vods v
      JOIN tasks t ON v.task_id = t.id
      WHERE t.user_id = $1 
      AND v.download_status = ANY($2)
    `, [userId, statusFilter]);

    const total = parseInt(countResult.rows[0].total);

    // Then get the actual queue items with priority ordering
    const queueResult = await client.query<QueueItem>(`
      SELECT 
        v.*,
        t.name as task_name,
        c.username as channel_name,
        g.name as game_name,
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE v.download_priority 
              WHEN 'critical' THEN 1
              WHEN 'high' THEN 2 
              WHEN 'normal' THEN 3
              WHEN 'low' THEN 4
              ELSE 5
            END,
            v.created_at ASC
        ) as position_in_queue
      FROM vods v
      JOIN tasks t ON v.task_id = t.id
      LEFT JOIN channels c ON v.channel_id = c.id
      LEFT JOIN games g ON v.game_id = g.id::TEXT
      WHERE t.user_id = $1 
      AND v.download_status = ANY($2)
      ORDER BY 
        CASE v.download_priority 
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2 
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        v.created_at ASC
      LIMIT $3 OFFSET $4
    `, [userId, statusFilter, limit, offset]);

    return {
      items: queueResult.rows,
      total
    };
  });
}

/**
 * Get queue history (completed/failed downloads)
 */
export async function getQueueHistory(
  pool: Pool,
  userId: number,
  statusFilter: string[] = ['completed', 'failed'],
  limit: number = 50,
  offset: number = 0,
  taskId?: number
): Promise<QueueResponse> {
  return withTransaction(pool, async (client) => {
    const baseWhere = taskId 
      ? 'WHERE t.user_id = $1 AND v.download_status = ANY($2) AND t.id = $3'
      : 'WHERE t.user_id = $1 AND v.download_status = ANY($2)';
    
    const countParams = taskId 
      ? [userId, statusFilter, taskId]
      : [userId, statusFilter];
    
    const historyParams = taskId 
      ? [userId, statusFilter, limit, offset, taskId]
      : [userId, statusFilter, limit, offset];

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM vods v
      JOIN tasks t ON v.task_id = t.id
      ${baseWhere}
    `;
    
    const countResult = await client.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Build proper query for history items
    let historyQuery = `
      SELECT 
        v.*,
        t.name as task_name,
        c.username as channel_name,
        g.name as game_name,
        cv.completed_at as actual_completed_at,
        cv.file_size_bytes as actual_file_size,
        cv.download_duration_seconds,
        cv.download_speed_mbps
      FROM vods v
      JOIN tasks t ON v.task_id = t.id
      LEFT JOIN channels c ON v.channel_id = c.id
      LEFT JOIN games g ON v.game_id = g.id
      LEFT JOIN completed_vods cv ON v.id = cv.vod_id
      WHERE t.user_id = $1 AND v.download_status = ANY($2)
    `;
    
    let historyQueryParams: any[] = [userId, statusFilter];
    let paramIndex = 3;
    
    if (taskId) {
      historyQuery += ` AND t.id = $${paramIndex}`;
      historyQueryParams.push(taskId);
      paramIndex++;
    }
    
    historyQuery += `
      ORDER BY 
        CASE WHEN v.download_status = 'completed' THEN cv.completed_at ELSE v.updated_at END DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    historyQueryParams.push(limit, offset);
    
    const historyResult = await client.query<QueueItem>(historyQuery, historyQueryParams);

    return {
      items: historyResult.rows,
      total
    };
  });
}

/**
 * Get queue statistics
 */
export async function getQueueStats(
  pool: Pool,
  userId: number,
  taskId?: number
): Promise<QueueStats> {
  return withTransaction(pool, async (client) => {
    const baseWhere = taskId 
      ? 'WHERE t.user_id = $1 AND t.id = $2'
      : 'WHERE t.user_id = $1';
    
    const params = taskId ? [userId, taskId] : [userId];

    const result = await client.query(`
      SELECT 
        COUNT(CASE WHEN v.download_status = 'pending' THEN 1 END)::INTEGER as pending,
        COUNT(CASE WHEN v.download_status = 'queued' THEN 1 END)::INTEGER as queued,
        COUNT(CASE WHEN v.download_status = 'downloading' THEN 1 END)::INTEGER as downloading,
        COUNT(CASE WHEN v.download_status = 'completed' THEN 1 END)::INTEGER as completed,
        COUNT(CASE WHEN v.download_status = 'failed' THEN 1 END)::INTEGER as failed,
        COALESCE(SUM(CASE WHEN v.download_status = 'completed' THEN v.file_size END), 0)::BIGINT as total_size_bytes,
        COALESCE(AVG(CASE WHEN v.download_status = 'completed' AND v.download_speed IS NOT NULL THEN v.download_speed END), 0)::NUMERIC as avg_download_speed
      FROM vods v
      JOIN tasks t ON v.task_id = t.id
      ${baseWhere}
    `, params);

    const row = result.rows[0];
    
    return {
      pending: row.pending || 0,
      queued: row.queued || 0,
      downloading: row.downloading || 0,
      completed: row.completed || 0,
      failed: row.failed || 0,
      total_size_bytes: parseInt(row.total_size_bytes) || 0,
      avg_download_speed: parseFloat(row.avg_download_speed) || 0
    };
  });
}

/**
 * Update VOD priority in download queue
 */
export async function updateVodPriority(
  pool: Pool,
  vodId: number,
  userId: number,
  priority: 'low' | 'normal' | 'high' | 'critical'
): Promise<VOD | null> {
  return withTransaction(pool, async (client) => {
    // Verify ownership and that VOD is in queue
    const verifyResult = await client.query(`
      SELECT v.id, v.download_status
      FROM vods v
      JOIN tasks t ON v.task_id = t.id
      WHERE v.id = $1 AND t.user_id = $2
      AND v.download_status IN ('pending', 'queued')
    `, [vodId, userId]);

    if (verifyResult.rows.length === 0) {
      return null;
    }

    // Update priority
    const updateResult = await client.query<VOD>(`
      UPDATE vods 
      SET 
        download_priority = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [vodId, priority]);

    logger.info(`Updated VOD ${vodId} priority to ${priority}`);
    return updateResult.rows[0];
  });
}

/**
 * Bulk update VOD priorities
 */
export async function bulkUpdatePriority(
  pool: Pool,
  updates: PriorityUpdate[],
  userId: number
): Promise<VOD[]> {
  return withTransaction(pool, async (client) => {
    const results: VOD[] = [];

    for (const update of updates) {
      const result = await updateVodPriority(pool, update.vod_id, userId, update.priority);
      if (result) {
        results.push(result);
      }
    }

    return results;
  });
}

/**
 * Clear all completed VODs from history
 */
export async function clearCompletedVods(
  pool: Pool,
  userId: number,
  taskId?: number
): Promise<{ deleted: number }> {
  return withTransaction(pool, async (client) => {
    const baseWhere = taskId 
      ? 'WHERE t.user_id = $1 AND v.download_status = $2 AND t.id = $3'
      : 'WHERE t.user_id = $1 AND v.download_status = $2';
    
    const params = taskId ? [userId, 'completed', taskId] : [userId, 'completed'];

    const result = await client.query(`
      DELETE FROM vods 
      USING tasks t
      WHERE vods.task_id = t.id
      AND t.user_id = $1 
      AND vods.download_status = 'completed'
      ${taskId ? 'AND t.id = $3' : ''}
    `, params);

    logger.info(`Cleared ${result.rowCount} completed VODs for user ${userId}${taskId ? ` and task ${taskId}` : ''}`);
    return { deleted: result.rowCount || 0 };
  });
}

/**
 * Move VOD to top of queue
 */
export async function moveVodToTop(
  pool: Pool,
  vodId: number,
  userId: number
): Promise<VOD | null> {
  return updateVodPriority(pool, vodId, userId, 'critical');
}

/**
 * Move VOD to bottom of queue
 */
export async function moveVodToBottom(
  pool: Pool,
  vodId: number,
  userId: number
): Promise<VOD | null> {
  return updateVodPriority(pool, vodId, userId, 'low');
}

/**
 * Get estimated completion time for queue
 */
export async function getQueueEstimate(
  pool: Pool,
  userId: number,
  taskId?: number
): Promise<{ estimatedMinutes: number; totalItems: number }> {
  return withTransaction(pool, async (client) => {
    const baseWhere = taskId 
      ? 'WHERE t.user_id = $1 AND t.id = $2'
      : 'WHERE t.user_id = $1';
    
    const params = taskId ? [userId, taskId] : [userId];

    // Get queue statistics and average download speed
    const result = await client.query(`
      SELECT 
        COUNT(CASE WHEN v.download_status IN ('pending', 'queued') THEN 1 END)::INTEGER as queue_items,
        AVG(CASE WHEN cv.download_duration_seconds IS NOT NULL AND cv.download_duration_seconds > 0 
                 THEN cv.download_duration_seconds END) as avg_duration_seconds
      FROM vods v
      JOIN tasks t ON v.task_id = t.id
      LEFT JOIN completed_vods cv ON v.id = cv.vod_id
      ${baseWhere}
    `, params);

    const row = result.rows[0];
    const queueItems = row.queue_items || 0;
    const avgDurationSeconds = row.avg_duration_seconds || 300; // Default 5 minutes
    
    const estimatedMinutes = Math.ceil((queueItems * avgDurationSeconds) / 60);
    
    return {
      estimatedMinutes,
      totalItems: queueItems
    };
  });
}

/**
 * Retry failed VOD download
 */
export async function retryFailedVod(
  pool: Pool,
  vodId: number,
  userId: number,
  resetRetryCount: boolean = false
): Promise<VOD | null> {
  return withTransaction(pool, async (client) => {
    // Verify ownership and that VOD is in failed state
    const verifyResult = await client.query(`
      SELECT v.id, v.retry_count, v.max_retries
      FROM vods v
      JOIN tasks t ON v.task_id = t.id
      WHERE v.id = $1 AND t.user_id = $2
      AND v.download_status = 'failed'
    `, [vodId, userId]);

    if (verifyResult.rows.length === 0) {
      return null;
    }

    const vod = verifyResult.rows[0];
    
    // Check if we can retry (unless reset is requested)
    if (!resetRetryCount && vod.retry_count >= vod.max_retries) {
      logger.warn(`VOD ${vodId} has exceeded max retries (${vod.retry_count}/${vod.max_retries})`);
      return null;
    }

    // Reset VOD to pending status for retry
    const updateResult = await client.query<VOD>(`
      UPDATE vods 
      SET 
        download_status = 'pending',
        error_message = NULL,
        download_progress = 0,
        retry_count = ${resetRetryCount ? '0' : 'retry_count + 1'},
        scheduled_for = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [vodId]);

    logger.info(`Retrying VOD ${vodId} download (retry count: ${resetRetryCount ? 0 : vod.retry_count + 1})`);
    return updateResult.rows[0];
  });
}

/**
 * Execute bulk operations on queue
 */
export async function executeBulkAction(
  pool: Pool,
  action: BulkAction,
  userId: number
): Promise<QueueOperationResult> {
  return withTransaction(pool, async (client) => {
    let affectedItems = 0;
    let message = '';
    const errors: string[] = [];

    try {
      switch (action.type) {
        case 'pause_all':
          affectedItems = await pauseAllDownloads(client, userId, action);
          message = `Paused ${affectedItems} downloads`;
          break;

        case 'resume_all':
          affectedItems = await resumeAllDownloads(client, userId, action);
          message = `Resumed ${affectedItems} downloads`;
          break;

        case 'cancel_all':
          affectedItems = await cancelAllDownloads(client, userId, action);
          message = `Cancelled ${affectedItems} downloads`;
          break;

        case 'clear_completed':
          affectedItems = await clearCompletedDownloads(client, userId, action);
          message = `Cleared ${affectedItems} completed downloads`;
          break;

        case 'set_priority':
          affectedItems = await setPriorityBulk(client, userId, action);
          message = `Updated priority for ${affectedItems} downloads`;
          break;

        default:
          throw new Error(`Unknown bulk action type: ${(action as any).type}`);
      }

      logger.info(`Bulk action ${action.type} completed: ${message}`);
      
      return {
        success: true,
        message,
        affected_items: affectedItems,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Bulk action ${action.type} failed:`, error);
      
      return {
        success: false,
        message: `Bulk action failed: ${errorMsg}`,
        affected_items: affectedItems,
        errors: [errorMsg]
      };
    }
  });
}

/**
 * Pause all downloads matching criteria
 */
async function pauseAllDownloads(
  client: PoolClient,
  userId: number,
  action: BulkAction
): Promise<number> {
  let whereClause = 't.user_id = $1 AND v.download_status IN (\'pending\', \'queued\', \'downloading\')';
  let params: any[] = [userId];
  let paramIndex = 2;

  // Apply filters
  if (action.target === 'selected' && action.item_ids) {
    whereClause += ` AND v.id = ANY($${paramIndex})`;
    params.push(action.item_ids.map(id => parseInt(id, 10)));
    paramIndex++;
  } else if (action.target === 'status' && action.status_filter) {
    whereClause += ` AND v.download_status = $${paramIndex}`;
    params.push(action.status_filter);
    paramIndex++;
  }

  const result = await client.query(`
    UPDATE vods v
    SET download_status = 'paused', 
        updated_at = NOW()
    FROM tasks t
    WHERE v.task_id = t.id AND ${whereClause}
  `, params);

  return result.rowCount || 0;
}

/**
 * Resume all downloads matching criteria
 */
async function resumeAllDownloads(
  client: PoolClient,
  userId: number,
  action: BulkAction
): Promise<number> {
  let whereClause = 't.user_id = $1 AND v.download_status = \'paused\'';
  let params: any[] = [userId];
  let paramIndex = 2;

  // Apply filters
  if (action.target === 'selected' && action.item_ids) {
    whereClause += ` AND v.id = ANY($${paramIndex})`;
    params.push(action.item_ids.map(id => parseInt(id, 10)));
    paramIndex++;
  }

  const result = await client.query(`
    UPDATE vods v
    SET download_status = 'pending', 
        updated_at = NOW()
    FROM tasks t
    WHERE v.task_id = t.id AND ${whereClause}
  `, params);

  return result.rowCount || 0;
}

/**
 * Cancel all downloads matching criteria
 */
async function cancelAllDownloads(
  client: PoolClient,
  userId: number,
  action: BulkAction
): Promise<number> {
  let whereClause = 't.user_id = $1 AND v.download_status IN (\'pending\', \'queued\', \'downloading\', \'paused\')';
  let params: any[] = [userId];
  let paramIndex = 2;

  // Apply filters
  if (action.target === 'selected' && action.item_ids) {
    whereClause += ` AND v.id = ANY($${paramIndex})`;
    params.push(action.item_ids.map(id => parseInt(id, 10)));
    paramIndex++;
  } else if (action.target === 'status' && action.status_filter) {
    whereClause += ` AND v.download_status = $${paramIndex}`;
    params.push(action.status_filter);
    paramIndex++;
  }

  const result = await client.query(`
    UPDATE vods v
    SET download_status = 'cancelled', 
        updated_at = NOW()
    FROM tasks t
    WHERE v.task_id = t.id AND ${whereClause}
  `, params);

  return result.rowCount || 0;
}

/**
 * Clear completed downloads
 */
async function clearCompletedDownloads(
  client: PoolClient,
  userId: number,
  action: BulkAction
): Promise<number> {
  let whereClause = 't.user_id = $1 AND v.download_status = \'completed\'';
  let params: any[] = [userId];
  let paramIndex = 2;

  // Apply filters
  if (action.target === 'selected' && action.item_ids) {
    whereClause += ` AND v.id = ANY($${paramIndex})`;
    params.push(action.item_ids.map(id => parseInt(id, 10)));
    paramIndex++;
  }

  const result = await client.query(`
    DELETE FROM vods 
    USING tasks t
    WHERE vods.task_id = t.id AND ${whereClause}
  `, params);

  return result.rowCount || 0;
}

/**
 * Set priority for multiple downloads
 */
async function setPriorityBulk(
  client: PoolClient,
  userId: number,
  action: BulkAction
): Promise<number> {
  if (!action.priority) {
    throw new Error('Priority must be specified for set_priority action');
  }

  let whereClause = 't.user_id = $1 AND v.download_status IN (\'pending\', \'queued\')';
  let params: any[] = [userId, action.priority];
  let paramIndex = 3;

  // Apply filters
  if (action.target === 'selected' && action.item_ids) {
    whereClause += ` AND v.id = ANY($${paramIndex})`;
    params.push(action.item_ids.map(id => parseInt(id, 10)));
    paramIndex++;
  } else if (action.target === 'status' && action.status_filter) {
    whereClause += ` AND v.download_status = $${paramIndex}`;
    params.push(action.status_filter);
    paramIndex++;
  }

  const result = await client.query(`
    UPDATE vods v
    SET download_priority = $2, 
        updated_at = NOW()
    FROM tasks t
    WHERE v.task_id = t.id AND ${whereClause}
  `, params);

  return result.rowCount || 0;
}
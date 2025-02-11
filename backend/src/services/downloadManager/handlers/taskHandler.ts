// Filepath: backend/src/services/downloadManager/handlers/taskHandler.ts

import { Pool, PoolClient } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger';
import { TwitchService } from '../../twitch/service';
import { TwitchVOD } from '../../twitch/types';
import { DownloadHandler } from './downloadHandler';
import axios from 'axios';

interface TaskProgress {
  message: string;
  total: number;
  completed: number;
  percentage: number;
}

export class TaskHandler extends EventEmitter {
  private twitchService: TwitchService;

  constructor(
    private pool: Pool,
    private downloadHandler: DownloadHandler
  ) {
    super();
    this.twitchService = TwitchService.getInstance();
  }

  async executeTask(taskId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Verify task exists and is active
      const taskResult = await client.query(`
        SELECT t.*, 
               array_agg(DISTINCT c.twitch_id) as channel_ids,
               array_agg(DISTINCT g.twitch_game_id) as game_ids
        FROM tasks t
        LEFT JOIN channels c ON c.id = ANY(t.channel_ids)
        LEFT JOIN games g ON g.id = ANY(t.game_ids)
        WHERE t.id = $1 AND t.is_active = true
        GROUP BY t.id
      `, [taskId]);

      if (taskResult.rows.length === 0) {
        throw new Error(`Task ${taskId} not found or is inactive`);
      }

      const task = taskResult.rows[0];
      let totalChannels = 0;
      let processedChannels = 0;
      let totalVods = 0;
      let processedVods = 0;
      let skippedVods = 0;

      // Process channels
      if (task.channel_ids?.length > 0) {
        totalChannels = task.channel_ids.length;

        for (const channelId of task.channel_ids) {
          try {
            await this.updateTaskProgress(taskId, {
              message: `Processing channel ${channelId}`,
              total: totalChannels,
              completed: processedChannels,
              percentage: (processedChannels / totalChannels) * 100
            }, client);

            const vods = await this.twitchService.getChannelVODs(channelId.toString());
            logger.info(`Found ${vods.length} downloadable VODs for channel ${channelId}`);
            totalVods += vods.length;

            for (const vod of vods) {
              try {
                const vodInfo = await this.twitchService.getVODInfo(vod.id);
                if (!vodInfo) {
                  throw new Error(`Failed to get metadata for VOD ${vod.id}`);
                }

                await this.queueVODDownload(vodInfo, task.priority, taskId, client);
                processedVods++;

                await this.updateTaskProgress(taskId, {
                  message: `Added VOD ${vod.id} to queue`,
                  total: totalVods,
                  completed: processedVods,
                  percentage: (processedVods / totalVods) * 100
                }, client);
              } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));

                if (axios.isAxiosError(error) && error.response?.status === 404) {
                  skippedVods++;
                  logger.warn(`Skipping unavailable VOD ${vod.id}`);

                  await client.query(`
                    INSERT INTO task_skipped_vods 
                      (task_id, vod_id, reason, error_message, created_at)
                    VALUES 
                      ($1, $2, 'VOD_NOT_FOUND', NULL, NOW())
                  `, [taskId, vod.id]);
                  continue;
                }

                await client.query(`
                  INSERT INTO task_skipped_vods 
                    (task_id, vod_id, reason, error_message, created_at)
                  VALUES 
                    ($1, $2, 'ERROR', $3, NOW())
                `, [taskId, vod.id, error.message]);

                skippedVods++;
                logger.error(`Error processing VOD ${vod.id}:`, error);
              }
            }

            processedChannels++;
          } catch (error) {
            logger.error(`Error processing channel ${channelId}:`, error);
          }
        }
      }

      // Update task completion
      await this.updateTaskCompletion(taskId, 'completed', {
        total_vods: totalVods,
        processed_vods: processedVods,
        skipped_vods: skippedVods
      }, client);

      this.emit('task:complete', {
        taskId,
        totalVods,
        processedVods,
        skipped_vods: skippedVods
      });

    } catch (error) {
      logger.error(`Error executing task ${taskId}:`, error);
      await this.updateTaskCompletion(taskId, 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      }, client);
      this.emit('task:error', { taskId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  private async queueVODDownload(
    vod: TwitchVOD,
    priority: string,
    taskId: number,
    client: PoolClient
  ): Promise<void> {
    try {
      await client.query('BEGIN');

      // Check if VOD exists
      const vodExists = await client.query(`
        SELECT id 
        FROM vods 
        WHERE twitch_id = $1::bigint
      `, [vod.id]);

      if (vodExists.rows.length === 0) {
        // Create new VOD entry
        await client.query(`
          INSERT INTO vods (
            twitch_id,
            task_id,
            title,
            description,
            duration,
            content_type,
            language,
            view_count,
            download_status,
            download_priority,
            retry_count,
            max_retries,
            preferred_quality,
            download_chat,
            download_markers,
            thumbnail_url,
            published_at,
            processing_options,
            created_at,
            updated_at
          ) VALUES (
            $1::bigint, $2, $3, $4, $5, $6, $7, $8, 'queued', $9, 0, 3, 'source',
            true, true, $10, $11, $12, NOW(), NOW()
          )
        `, [
          vod.id,
          taskId,
          vod.title,
          vod.description,
          vod.duration,
          vod.type === 'highlight' ? 'highlight' : 'stream', // Map Twitch type to our content_type
          vod.language,
          vod.view_count,
          priority,
          vod.thumbnail_url,
          vod.published_at,
          { transcode: false, extract_chat: true }
        ]);
      } else {
        // Update existing VOD
        await client.query(`
          UPDATE vods 
          SET download_status = 'queued',
              task_id = $2,
              title = $3,
              description = $4,
              duration = $5,
              content_type = $6,
              language = $7,
              view_count = $8,
              download_priority = $9,
              thumbnail_url = $10,
              published_at = $11,
              processing_options = $12,
              retry_count = 0,
              updated_at = NOW()
          WHERE twitch_id = $1::bigint
        `, [
          vod.id,
          taskId,
          vod.title,
          vod.description,
          vod.duration,
          vod.type === 'highlight' ? 'highlight' : 'stream',
          vod.language,
          vod.view_count,
          priority,
          vod.thumbnail_url,
          vod.published_at,
          { transcode: false, extract_chat: true }
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  private async updateTaskProgress(
    taskId: number,
    progress: TaskProgress,
    client: PoolClient
  ): Promise<void> {
    try {
      await client.query(`
        UPDATE task_monitoring
        SET status_message = $2,
            items_total = $3,
            items_completed = $4,
            progress_percentage = $5,
            last_check_at = NOW(),
            updated_at = NOW()
        WHERE task_id = $1
      `, [
        taskId,
        progress.message,
        progress.total,
        progress.completed,
        progress.percentage
      ]);

      this.emit('task:progress', { taskId, ...progress });
    } catch (error) {
      logger.error(`Error updating task progress for task ${taskId}:`, error);
    }
  }

  private async updateTaskCompletion(
    taskId: number,
    status: 'completed' | 'failed',
    details: Record<string, any>,
    client: PoolClient
  ): Promise<void> {
    try {
      await client.query('BEGIN');

      await client.query(`
        UPDATE task_monitoring
        SET status = $2,
            status_message = $3,
            progress_percentage = $4,
            updated_at = NOW()
        WHERE task_id = $1
      `, [
        taskId,
        status,
        status === 'completed' ? 'Task completed successfully' : 'Task failed',
        status === 'completed' ? 100 : 0
      ]);

      await client.query(`
        UPDATE tasks
        SET status = $2,
            updated_at = NOW(),
            error_message = $3
        WHERE id = $1
      `, [
        taskId,
        status,
        status === 'failed' ? details.error : null
      ]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error updating task completion for task ${taskId}:`, error);
    }
  }
}

export default TaskHandler;

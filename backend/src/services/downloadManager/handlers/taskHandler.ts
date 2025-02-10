// Filepath: backend/src/services/downloadManager/handlers/taskHandler.ts

import { Pool, PoolClient } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger';
import { TwitchAPIService } from '../../twitch/api';
import { DownloadHandler } from './downloadHandler';
import axios from 'axios';

interface TaskProgress {
  message: string;
  total: number;
  completed: number;
  percentage: number;
}

interface VodMetadata {
  id: string;
  title: string;
  description: string;
  created_at: string;
  duration: string;
  language: string;
  view_count: number;
  content_type: string;
}

export class TaskHandler extends EventEmitter {
  private twitchAPI: TwitchAPIService;

  constructor(
    private pool: Pool,
    private downloadHandler: DownloadHandler
  ) {
    super();
    this.twitchAPI = TwitchAPIService.getInstance();
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

            const vods = await this.twitchAPI.getChannelVODs(channelId.toString());
            logger.info(`Found ${vods.length} downloadable VODs for channel ${channelId}`);
            totalVods += vods.length;

            for (const vod of vods) {
              try {
                // Fetch VOD metadata before queueing
                try {
                  const vodMetadata = await this.twitchAPI.getVODInfo(vod.id);
                  await this.queueVODDownload(vodMetadata, task.priority, taskId, client);
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
                    // VOD is no longer available, skip it
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

                  // Log other errors
                  await client.query(`
                    INSERT INTO task_skipped_vods 
                      (task_id, vod_id, reason, error_message, created_at)
                    VALUES 
                      ($1, $2, 'ERROR', $3, NOW())
                  `, [taskId, vod.id, error.message]);

                  skippedVods++;
                  logger.error(`Error processing VOD ${vod.id}:`, error);
                }
              } catch (error) {
                logger.error(`Error queuing VOD ${vod.id}:`, error);
              }
            }

            processedChannels++;
          } catch (error) {
            logger.error(`Error processing channel ${channelId}:`, error);
          }
        }
      }

      // Process games
      if (task.game_ids?.length > 0) {
        // Similar process for games...
        // Implement game VOD discovery logic here
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
        skippedVods
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

  // Rest of the class implementation...
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
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
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

  private async queueVODDownload(
    vodMetadata: VodMetadata,
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
      `, [vodMetadata.id]);

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
            processing_options,
            created_at,
            updated_at
          ) VALUES (
            $1::bigint,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            'queued',
            $9,
            0,
            3,
            'source',
            true,
            true,
            $10,
            NOW(),
            NOW()
          )
        `, [
          vodMetadata.id,
          taskId,
          vodMetadata.title,
          vodMetadata.description,
          vodMetadata.duration,
          vodMetadata.content_type,
          vodMetadata.language,
          vodMetadata.view_count,
          priority,
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
              retry_count = 0,
              updated_at = NOW()
          WHERE twitch_id = $1::bigint
        `, [
          vodMetadata.id,
          taskId,
          vodMetadata.title,
          vodMetadata.description,
          vodMetadata.duration,
          vodMetadata.content_type,
          vodMetadata.language,
          vodMetadata.view_count,
          priority
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

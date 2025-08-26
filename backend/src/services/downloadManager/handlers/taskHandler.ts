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

  /**
   * Maps task priority levels to valid download priority enum values  
   */
  private mapTaskPriorityToDownloadPriority(taskPriority: string): string {
    switch (taskPriority?.toLowerCase()) {
      case 'low':
        return 'low';
      case 'medium':
        return 'normal';  // Map medium to normal
      case 'high':
        return 'high';
      case 'critical':
        return 'critical';
      default:
        return 'normal';  // Default fallback
    }
  }

  async executeTask(taskId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      logger.info(`TaskHandler: Starting execution for task ${taskId}`);
      
      // Verify task exists and is active
      const taskResult = await client.query(`
        SELECT t.*, 
               array_agg(DISTINCT c.twitch_id) as channel_twitch_ids,
               array_agg(DISTINCT c.id) as channel_db_ids,
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

      logger.info(`TaskHandler: Found task ${taskId}`, {
        name: taskResult.rows[0].name,
        channel_twitch_ids: taskResult.rows[0].channel_twitch_ids,
        channel_db_ids: taskResult.rows[0].channel_db_ids,
        game_ids: taskResult.rows[0].game_ids
      });

      const task = taskResult.rows[0];
      let totalChannels = 0;
      let processedChannels = 0;
      let totalVods = 0;
      let processedVods = 0;
      let skippedVods = 0;

      // Process channels
      if (task.channel_twitch_ids?.length > 0) {
        totalChannels = task.channel_twitch_ids.length;
        logger.info(`TaskHandler: Processing ${totalChannels} channels for task ${taskId}`);

        for (let i = 0; i < task.channel_twitch_ids.length; i++) {
          const channelTwitchId = task.channel_twitch_ids[i];
          const channelDbId = task.channel_db_ids[i];
          try {
            logger.info(`TaskHandler: Processing channel ${channelTwitchId} (${processedChannels + 1}/${totalChannels})`);
            
            await this.updateTaskProgress(taskId, {
              message: `Processing channel ${channelTwitchId}`,
              total: totalChannels,
              completed: processedChannels,
              percentage: (processedChannels / totalChannels) * 100
            }, client);

            logger.info(`TaskHandler: Fetching VODs for channel ${channelTwitchId}...`);
            const vods = await this.twitchService.getChannelVODs(channelTwitchId.toString());
            logger.info(`TaskHandler: Found ${vods.length} downloadable VODs for channel ${channelTwitchId}`);
            totalVods += vods.length;

            for (const vod of vods) {
              try {
                const vodInfo = await this.twitchService.getVODInfo(vod.id);
                if (!vodInfo) {
                  throw new Error(`Failed to get metadata for VOD ${vod.id}`);
                }

                // Map task priority to valid download priority
                const downloadPriority = this.mapTaskPriorityToDownloadPriority(task.priority);
                logger.info(`Task ${taskId}: mapping priority "${task.priority}" -> "${downloadPriority}"`);
                await this.queueVODDownload(vodInfo, downloadPriority, taskId, channelDbId, client);
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
            logger.error(`Error processing channel ${channelTwitchId}:`, error);
          }
        }
      }

      // Update task monitoring to show discovery completed but task still running
      await client.query(`
        UPDATE task_monitoring
        SET status_message = $2,
            items_total = $3,
            items_completed = $4,
            progress_percentage = 50,
            updated_at = NOW()
        WHERE task_id = $1
      `, [
        taskId,
        `VOD discovery completed: ${processedVods} VODs queued for download`,
        totalVods,
        processedVods
      ]);

      // Keep task status as 'running' (don't mark as completed)
      await client.query(`
        UPDATE tasks
        SET status = 'running',
            last_run = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [taskId]);

      logger.info(`Task ${taskId} VOD discovery completed - ${processedVods} VODs queued for download, ${skippedVods} skipped. Task remains running.`);

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
    channelId: number,
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
            channel_id,
            title,
            description,
            duration,
            content_type,
            language,
            view_count,
            status,
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
            $1::bigint, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', 'queued', $10, 0, 3, 'source',
            true, true, $11, $12, $13, NOW(), NOW()
          )
        `, [
          vod.id,
          taskId,
          channelId,
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
          SET status = 'queued',
              download_status = 'queued',
              task_id = $2,
              channel_id = $3,
              title = $4,
              description = $5,
              duration = $6,
              content_type = $7,
              language = $8,
              view_count = $9,
              download_priority = $10,
              thumbnail_url = $11,
              published_at = $12,
              processing_options = $13,
              retry_count = 0,
              updated_at = NOW()
          WHERE twitch_id = $1::bigint
        `, [
          vod.id,
          taskId,
          channelId,
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

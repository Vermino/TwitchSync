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
        game_ids: taskResult.rows[0].game_ids,
        has_game_filters: taskResult.rows[0].game_ids && taskResult.rows[0].game_ids.filter((id: any) => id != null).length > 0
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
            const allVods = await this.twitchService.getChannelVODs(channelTwitchId.toString());
            logger.info(`TaskHandler: Found ${allVods.length} total VODs for channel ${channelTwitchId}`);
            
            // Filter VODs by game if game filters are specified
            const filteredVods = await this.filterVODsByGames(allVods, task.game_ids);
            logger.info(`TaskHandler: After game filtering: ${filteredVods.length} VODs match task criteria for channel ${channelTwitchId}`);
            
            totalVods += filteredVods.length;

            for (const vod of filteredVods) {
              try {
                const vodInfo = await this.twitchService.getVODInfo(vod.id);
                if (!vodInfo) {
                  throw new Error(`Failed to get metadata for VOD ${vod.id}`);
                }

                // Map task priority to valid download priority
                const downloadPriority = this.mapTaskPriorityToDownloadPriority(task.priority);
                logger.info(`Task ${taskId}: mapping priority "${task.priority}" -> "${downloadPriority}"`);
                
                // Ensure the game exists in our database before queuing
                await this.ensureGameExists(vodInfo, client);
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

  /**
   * Filters VODs by the specified game IDs. If no game filters are provided,
   * returns all VODs. Otherwise, only returns VODs that match the specified games.
   */
  private async filterVODsByGames(vods: any[], gameIds: string[] | null): Promise<any[]> {
    // Clean up the game IDs array (remove nulls)
    const validGameIds = gameIds?.filter(id => id != null && id !== '') || [];
    
    // If no game filters specified, return all VODs
    if (validGameIds.length === 0) {
      logger.info('No game filters specified, returning all VODs');
      return vods;
    }

    logger.info(`Filtering ${vods.length} VODs by ${validGameIds.length} game(s):`, validGameIds);
    const filteredVods = [];
    let checkedCount = 0;
    let matchedCount = 0;
    let errorCount = 0;

    for (const vod of vods) {
      try {
        checkedCount++;
        
        // Get detailed VOD info to check the game
        const vodInfo = await this.twitchService.getVODInfo(vod.id);
        
        if (!vodInfo) {
          logger.warn(`Skipping VOD ${vod.id} - could not get VOD info`);
          continue;
        }

        // Check if VOD's game matches any of the specified games
        if (vodInfo.game_id && validGameIds.includes(vodInfo.game_id)) {
          filteredVods.push(vod);
          matchedCount++;
          logger.debug(`✓ VOD ${vod.id} matches game filter (game: ${vodInfo.game_id}, title: "${vodInfo.title?.substring(0, 50)}...")`);
        } else {
          logger.debug(`✗ VOD ${vod.id} does not match game filter (game: ${vodInfo.game_id || 'none'}, title: "${vodInfo.title?.substring(0, 50)}...")`);
        }
        
        // Add a small delay to avoid rate limiting
        if (checkedCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        errorCount++;
        logger.warn(`Error checking game for VOD ${vod.id}:`, error);
        // Continue to next VOD instead of failing entire task
        continue;
      }
    }

    logger.info(`Game filtering complete: ${matchedCount}/${checkedCount} VODs matched (${errorCount} errors)`);
    return filteredVods;
  }

  /**
   * Ensures that a game referenced by a VOD exists in our database.
   * If not, fetches the game info from Twitch and creates it.
   */
  private async ensureGameExists(vodInfo: any, client: PoolClient): Promise<void> {
    if (!vodInfo.game_id) {
      return; // No game to check
    }

    try {
      // Check if game already exists
      const gameCheck = await client.query(`
        SELECT id FROM games WHERE twitch_game_id = $1
      `, [vodInfo.game_id]);

      if (gameCheck.rows.length === 0) {
        logger.info(`Game ${vodInfo.game_id} not in database, fetching from Twitch...`);
        
        // Fetch game info from Twitch
        const gameInfo = await this.twitchService.getGameById(vodInfo.game_id);
        
        if (gameInfo) {
          // Create the game in our database
          await client.query(`
            INSERT INTO games (
              twitch_game_id, name, box_art_url, category, status, is_active, 
              created_at, updated_at, last_checked
            ) VALUES (
              $1, $2, $3, $4, 'active', true, NOW(), NOW(), NOW()
            ) ON CONFLICT (twitch_game_id) DO NOTHING
          `, [
            gameInfo.id,
            gameInfo.name,
            gameInfo.box_art_url,
            gameInfo.category || 'general'
          ]);
          
          logger.info(`Created game in database: ${gameInfo.name} (${gameInfo.id})`);
        } else {
          logger.warn(`Could not fetch game info for ${vodInfo.game_id}`);
        }
      }
    } catch (error) {
      logger.error(`Error ensuring game ${vodInfo.game_id} exists:`, error);
      // Don't throw - continue with VOD processing even if game creation fails
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
        // Create new VOD entry with game_id populated
        await client.query(`
          INSERT INTO vods (
            twitch_id,
            task_id,
            channel_id,
            game_id,
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
            $1::bigint, $2, $3, 
            (SELECT id FROM games WHERE twitch_game_id = $14 LIMIT 1),
            $4, $5, $6, $7, $8, $9, 'queued', 'queued', $10, 0, 3, 'source',
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
          { transcode: false, extract_chat: true },
          vod.game_id || null // Add the game_id parameter
        ]);
      } else {
        // Update existing VOD with game_id
        await client.query(`
          UPDATE vods 
          SET status = 'queued',
              download_status = 'queued',
              task_id = $2,
              channel_id = $3,
              game_id = (SELECT id FROM games WHERE twitch_game_id = $14 LIMIT 1),
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
          { transcode: false, extract_chat: true },
          vod.game_id || null // Add the game_id parameter
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

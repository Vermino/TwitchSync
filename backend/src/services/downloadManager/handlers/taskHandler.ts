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
            const filteredVods = await this.filterVODsByGames(allVods, task.game_ids, taskId);
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
      const hasGameFilters = task.game_ids && task.game_ids.filter((id: any) => id != null).length > 0;
      const statusMessage = hasGameFilters 
        ? `VOD discovery completed: ${processedVods} VODs queued (filtered by title matching)`
        : `VOD discovery completed: ${processedVods} VODs queued for download`;

      await client.query(`
        UPDATE task_monitoring
        SET status_message = $2,
            items_total = $3,
            items_completed = $4,
            progress_percentage = 100,
            updated_at = NOW()
        WHERE task_id = $1
      `, [
        taskId,
        statusMessage,
        totalVods,
        processedVods
      ]);

      // Mark task as completed since VOD discovery is done
      await client.query(`
        UPDATE tasks
        SET status = 'completed',
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
   * Filters VODs by the specified game IDs using enhanced title-based matching.
   * 
   * Since Twitch's Videos API does not include game_id information,
   * we use the game names from our database to search for matches in VOD titles.
   * Enhanced with fuzzy matching, partial matches, and detailed logging.
   */
  private async filterVODsByGames(vods: any[], gameIds: string[] | null, taskId?: number): Promise<any[]> {
    // Clean up the game IDs array (remove nulls)
    const validGameIds = gameIds?.filter(id => id != null && id !== '') || [];
    
    logger.info(`filterVODsByGames called with gameIds: ${JSON.stringify(gameIds)}, validGameIds: ${JSON.stringify(validGameIds)}`);
    
    // If no game filters specified, return all VODs
    if (validGameIds.length === 0) {
      logger.info('No game filters specified, returning all VODs');
      return vods;
    }

    // Get game names from database for title-based filtering
    const client = await this.pool.connect();
    let gameNames: string[] = [];
    
    try {
      logger.info(`Querying games table with IDs: ${JSON.stringify(validGameIds)}`);
      
      const gameResult = await client.query(`
        SELECT id, name FROM games WHERE twitch_game_id = ANY($1)
      `, [validGameIds]);
      
      logger.info(`Database query returned ${gameResult.rows.length} games:`, gameResult.rows);
      
      gameNames = gameResult.rows.map(row => row.name);
      logger.info(`Title-based filtering: Looking for games: ${gameNames.join(', ')}`);
    } catch (error) {
      logger.error('Error fetching game names for filtering:', error);
      // If we can't get game names, return all VODs as fallback
      return vods;
    } finally {
      client.release();
    }

    if (gameNames.length === 0) {
      logger.warn('No game names found for filtering, returning all VODs');
      return vods;
    }

    // Enhanced VOD filtering with fuzzy matching and detailed logging
    const filteredVods = [];
    const filteredOutVods = [];
    let checkedCount = 0;
    let matchedCount = 0;

    for (const vod of vods) {
      try {
        checkedCount++;
        const title = vod.title?.toLowerCase() || '';
        const originalTitle = vod.title || '';
        
        // Check if any game name appears in the VOD title using enhanced matching
        const gameMatchResult = this.checkGameMatch(title, gameNames);
        
        if (gameMatchResult.matches) {
          filteredVods.push(vod);
          matchedCount++;
          logger.info(`✓ VOD ${vod.id} matches game filter (${gameMatchResult.matchType}: "${gameMatchResult.matchedGame}") - title: "${originalTitle.substring(0, 100)}"`);
        } else {
          // Determine specific skip reason based on match result
          let skipReason = 'GAME_FILTER';
          if (gameMatchResult.details?.includes('promotional') || gameMatchResult.details?.includes('coming') || 
              gameMatchResult.details?.includes('dlc') || gameMatchResult.details?.includes('until')) {
            skipReason = 'GAME_FILTER_PROMOTIONAL';
          } else if (gameMatchResult.details?.includes('context') || gameMatchResult.details?.includes('position')) {
            skipReason = 'GAME_FILTER_CONTEXT';
          }

          filteredOutVods.push({
            vodId: vod.id,
            title: originalTitle,
            reason: skipReason,
            gamesSearched: gameNames,
            details: gameMatchResult.details
          });
          logger.info(`✗ VOD ${vod.id} filtered out (${skipReason}) - title: "${originalTitle.substring(0, 100)}" (${gameMatchResult.details})`);
        }
      } catch (error) {
        logger.warn(`Error checking title for VOD ${vod.id}:`, error);
        // When in doubt, include the VOD to avoid missing content
        filteredVods.push(vod);
        continue;
      }
    }

    // Store filtered VODs for user visibility if taskId provided
    if (taskId && filteredOutVods.length > 0) {
      await this.recordFilteredVODs(taskId, filteredOutVods);
    }

    logger.info(`Title-based filtering complete: ${matchedCount}/${checkedCount} VODs matched game criteria`);
    return filteredVods;
  }

  /**
   * Enhanced game matching with context-aware filtering to avoid false positives
   * where games are mentioned but not being played
   */
  private checkGameMatch(title: string, gameNames: string[]): { 
    matches: boolean; 
    matchType: string; 
    matchedGame?: string; 
    details: string;
  } {
    for (const gameName of gameNames) {
      const gameNameLower = gameName.toLowerCase();
      const gameWords = gameNameLower.split(/\s+/);
      const titleLower = title.toLowerCase();
      const titleWords = titleLower.split(/\s+/);
      
      // First check if the game name appears at all in the title
      const gameAppears = titleLower.includes(gameNameLower) || 
        gameWords.every(word => titleWords.some(titleWord => titleWord.includes(word)));
      
      if (!gameAppears) {
        continue; // Skip to next game if this one doesn't appear
      }
      
      // Now check if it's likely being played vs just mentioned
      const contextResult = this.analyzeGameContext(title, gameNameLower, gameName);
      
      if (contextResult.isActualGameplay) {
        return {
          matches: true,
          matchType: contextResult.matchType,
          matchedGame: gameName,
          details: contextResult.reason
        };
      } else {
        // Game appears but context suggests it's not being played
        logger.info(`Game "${gameName}" appears in title but context suggests it's not being played: ${contextResult.reason}`);
      }
    }
    
    return { 
      matches: false, 
      matchType: 'none', 
      details: `Games found but context suggests they're not being played: ${gameNames.join(', ')}` 
    };
  }

  /**
   * Analyzes the context around a game name to determine if it's likely being played
   * vs just mentioned/promoted
   */
  private analyzeGameContext(title: string, gameNameLower: string, originalGameName: string): {
    isActualGameplay: boolean;
    matchType: string;
    reason: string;
  } {
    const titleLower = title.toLowerCase();
    const words = titleLower.split(/\s+/);
    
    // Find the position/index where the game name appears
    const gameIndex = titleLower.indexOf(gameNameLower);
    const gameWordCount = gameNameLower.split(/\s+/).length;
    
    // Calculate relative position in title (0 = start, 1 = end)
    const relativePosition = gameIndex / Math.max(1, titleLower.length - gameNameLower.length);
    
    // Context indicators that suggest it's NOT actual gameplay
    const promotionalIndicators = [
      'coming soon', 'tomorrow', 'next week', 'next month', 'later', 'afterwards', 'after',
      'dlc', 'expansion', 'update', 'patch', 'announcement', 'reveal', 'trailer',
      'until', 'days until', 'weeks until', 'months until', 'waiting for',
      'hyped for', 'excited for', 'looking forward', 'can\'t wait',
      'preview', 'teaser', 'leak', 'rumors', 'speculation',
      'it is coming', 'is coming', 'will be', 'gonna be', 'going to be'
    ];
    
    // Context indicators that suggest it IS actual gameplay
    const gameplayIndicators = [
      'playing', 'stream', 'gaming', 'run', 'playthrough', 'let\'s play',
      'session', 'continues', 'continuing', 'part', 'episode',
      'build', 'colony', 'base', 'world', 'save', 'file',
      'challenge', 'permadeath', 'hardcore', 'modded', 'vanilla',
      'first time', 'blind', 'reaction', 'tutorial', 'guide',
      'speedrun', 'race', 'competition'
    ];
    
    // Negative context words that appear near the game name
    const surroundingText = this.extractSurroundingContext(titleLower, gameIndex, gameNameLower.length, 50);
    
    // Check for promotional language
    for (const indicator of promotionalIndicators) {
      if (surroundingText.includes(indicator)) {
        return {
          isActualGameplay: false,
          matchType: 'promotional_mention',
          reason: `Contains promotional language: "${indicator}"`
        };
      }
    }
    
    // If game appears very late in title (last 25%), it's often promotional
    if (relativePosition > 0.75) {
      return {
        isActualGameplay: false,
        matchType: 'late_position_mention',
        reason: `Game appears late in title (${Math.round(relativePosition * 100)}% through), likely promotional`
      };
    }
    
    // Check for gameplay indicators, but be careful about context
    let gameplayScore = 0;
    const foundGameplayIndicators: string[] = [];
    
    for (const indicator of gameplayIndicators) {
      if (titleLower.includes(indicator)) {
        // Special case: "world" indicator should only count if it's part of the game name or in gameplay context
        if (indicator === 'world') {
          // Don't count "world" if it appears in listing/comparison context
          const listingContext = ['like', 'such as', 'including', 'games', 'exist', 'and', 'or', 'great'];
          const hasListingContext = listingContext.some(ctx => titleLower.includes(ctx));
          
          if (hasListingContext) {
            continue; // Skip this "world" as it's likely just part of game name in listing context
          }
          
          // Only count "world" if it's close to actual gameplay words
          const gameplayContext = ['playing', 'new', 'build', 'create', 'start', 'explore', 'my', 'starting'];
          const hasGameplayContext = gameplayContext.some(ctx => titleLower.includes(ctx));
          
          if (!hasGameplayContext) {
            continue; // Skip this "world" as it's likely just part of game name in non-gameplay context
          }
        }
        
        gameplayScore++;
        foundGameplayIndicators.push(indicator);
      }
    }
    
    // If game appears early in title (first 50%) and has gameplay context, likely playing
    if (relativePosition <= 0.5 && gameplayScore > 0) {
      return {
        isActualGameplay: true,
        matchType: 'early_position_with_context',
        reason: `Game appears early in title with gameplay indicators: ${foundGameplayIndicators.join(', ')}`
      };
    }
    
    // If game appears at the very beginning (first 20%), likely being played
    if (relativePosition <= 0.2) {
      return {
        isActualGameplay: true,
        matchType: 'title_start_position',
        reason: `Game appears at beginning of title (${Math.round(relativePosition * 100)}% position)`
      };
    }
    
    // Check for exact word boundaries (not partial matches in compound words)
    const exactWordMatch = this.hasExactWordBoundaryMatch(titleLower, gameNameLower);
    if (exactWordMatch && relativePosition <= 0.6) {
      // Even with exact word boundary, check for listing/comparison context
      const listingContext = ['like', 'such as', 'including', 'games', 'exist', 'similar to', 'compared to', 'versus', 'vs'];
      const hasListingContext = listingContext.some(ctx => titleLower.includes(ctx));
      
      if (hasListingContext) {
        return {
          isActualGameplay: false,
          matchType: 'listing_context_mention',
          reason: `Game appears in listing/comparison context despite exact word match`
        };
      }
      
      return {
        isActualGameplay: true,
        matchType: 'exact_word_boundary',
        reason: `Exact word boundary match in reasonable position`
      };
    }
    
    // For partial word matches, be more strict
    if (!exactWordMatch) {
      // Check if it's just a partial match within a different word
      const gameWords = gameNameLower.split(/\s+/);
      if (gameWords.length === 1 && gameWords[0].length <= 6) {
        // Short single words are more likely to be false positives when partial
        return {
          isActualGameplay: false,
          matchType: 'partial_word_false_positive',
          reason: `Short game name "${gameWords[0]}" appears as partial match, likely false positive`
        };
      }
    }
    
    // Default: if no strong promotional indicators and reasonable position, assume gameplay
    if (relativePosition <= 0.6) {
      return {
        isActualGameplay: true,
        matchType: 'default_reasonable_position',
        reason: `Game appears in reasonable position without promotional context`
      };
    }
    
    // Late position without clear context - be conservative
    return {
      isActualGameplay: false,
      matchType: 'ambiguous_late_position',
      reason: `Game appears late in title without clear gameplay context`
    };
  }

  /**
   * Extracts text around the game name for context analysis
   */
  private extractSurroundingContext(text: string, startIndex: number, gameLength: number, contextWindow: number): string {
    const contextStart = Math.max(0, startIndex - contextWindow);
    const contextEnd = Math.min(text.length, startIndex + gameLength + contextWindow);
    return text.substring(contextStart, contextEnd);
  }

  /**
   * Checks if the game name appears with exact word boundaries (not as part of other words)
   */
  private hasExactWordBoundaryMatch(title: string, gameName: string): boolean {
    // Create regex with word boundaries
    const regex = new RegExp(`\\b${gameName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regex.test(title);
  }


  /**
   * Records filtered out VODs for user visibility and debugging
   */
  private async recordFilteredVODs(taskId: number, filteredVods: any[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      for (const filtered of filteredVods) {
        await client.query(`
          INSERT INTO task_skipped_vods 
            (task_id, vod_id, reason, error_message, created_at)
          VALUES 
            ($1, $2, 'GAME_FILTER', $3, NOW())
          ON CONFLICT (task_id, vod_id) DO UPDATE SET
            reason = EXCLUDED.reason,
            error_message = EXCLUDED.error_message,
            created_at = EXCLUDED.created_at
        `, [
          taskId, 
          filtered.vodId, 
          JSON.stringify({
            title: filtered.title,
            reason: filtered.reason,
            games_searched: filtered.gamesSearched,
            details: filtered.details
          })
        ]);
      }
      logger.info(`Recorded ${filteredVods.length} filtered VODs for task ${taskId}`);
    } catch (error) {
      logger.error(`Error recording filtered VODs for task ${taskId}:`, error);
    } finally {
      client.release();
    }
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

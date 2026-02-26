// Filepath: backend/src/routes/channels/controller.ts

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { TwitchService } from '../../services/twitch/service';
import { withTransaction } from '../../middleware/withTransaction';
import {
  ChannelError,
  Channel,
  CreateChannelRequest,
  UpdateChannelRequest,
  validateChannelData
} from './validation';
import { DiscoveryIndexer } from '../../services/discovery/discovery-indexer';

export class ChannelsController {
  private twitchService: TwitchService;

  constructor(private pool: Pool) {
    this.twitchService = TwitchService.getInstance();
  }

  searchChannels = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query } = req.query;

      const channels = await this.twitchService.searchChannels(query as string);

      // Cache results for 5 minutes
      res.set('Cache-Control', 'public, max-age=300');
      res.json(channels);
    } catch (error) {
      logger.error('Error searching channels:', error);
      next(new ChannelError('Failed to search channels', 500));
    }
  };

  getAllChannels = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;

      const result = await withTransaction(this.pool, async (client) => {
        // Get total count
        const countResult = await client.query(
          'SELECT COUNT(*) FROM channels WHERE is_active = true'
        );
        const total = parseInt(countResult.rows[0].count);

        // Get paginated channels with related data
        const channelsResult = await client.query(`
          WITH last_stream AS (
            SELECT DISTINCT ON (channel_id)
              channel_id,
              game_id,
              started_at as last_stream_date,
              COALESCE(is_live, false) as is_live
            FROM channel_game_history
            ORDER BY channel_id, started_at DESC
          )
          SELECT 
            c.*,
            COALESCE(ls.is_live, false) as is_live,
            ls.last_stream_date,
            g.id as last_game_id,
            g.name as last_game_name,
            g.box_art_url as last_game_box_art
          FROM channels c
          LEFT JOIN last_stream ls ON c.id = ls.channel_id
          LEFT JOIN games g ON ls.game_id = g.id
          WHERE c.is_active = true
          ORDER BY c.follower_count DESC
          LIMIT $1 OFFSET $2
        `, [limit, offset]);

        return {
          channels: channelsResult.rows,
          pagination: {
            total,
            page,
            limit,
            hasMore: offset + channelsResult.rows.length < total
          }
        };
      });

      // Enrich channels with live Twitch API data
      const updatedChannels = await Promise.all(
        result.channels.map(async (channel) => {
          try {
            // Backfill missing profile_image_url from Twitch API
            if (!channel.profile_image_url && channel.username) {
              try {
                const twitchUser = await this.twitchService.getChannelInfo(channel.username);
                if (twitchUser?.profile_image_url) {
                  channel.profile_image_url = twitchUser.profile_image_url;
                  const updateClient = await this.pool.connect();
                  try {
                    await updateClient.query(
                      'UPDATE channels SET profile_image_url = $1, updated_at = NOW() WHERE id = $2',
                      [twitchUser.profile_image_url, channel.id]
                    );
                    logger.info(`Backfilled profile_image_url for channel ${channel.username}`);
                  } finally {
                    updateClient.release();
                  }
                }
              } catch (err) {
                logger.warn(`Could not backfill profile image for ${channel.username}:`, err);
              }
            }

            let enriched = { ...channel };

            // Use /channels endpoint to get current game (works even when offline)
            try {
              const channelInfo = await this.twitchService.getChannelInfoById(channel.twitch_id);
              if (channelInfo && channelInfo.game_id && channelInfo.game_name) {
                // Get box art for the game
                let boxArtUrl = '';
                try {
                  const gameInfo = await this.twitchService.getGameById(channelInfo.game_id);
                  if (gameInfo) {
                    boxArtUrl = gameInfo.box_art_url || '';
                  }
                } catch { /* ignore */ }

                // Set as last game
                enriched.last_game_id = channelInfo.game_id;
                enriched.last_game_name = channelInfo.game_name;
                enriched.last_game_box_art = boxArtUrl;

                // Set as most played game (from live /channels API data)
                enriched.most_played_game = {
                  id: channelInfo.game_id,
                  name: channelInfo.game_name,
                  box_art_url: boxArtUrl
                };
              }
            } catch (err) {
              logger.warn(`Could not fetch channel info for ${channel.username}:`, err);
            }

            // Check if currently live via /streams endpoint
            const currentGame = await this.twitchService.getCurrentGame(channel.twitch_id);
            if (currentGame) {
              enriched.is_live = true;
              enriched.last_game_id = currentGame.id;
              enriched.last_game_name = currentGame.name;
              enriched.last_game_box_art = currentGame.box_art_url;
            }

            // Fetch VODs for last_stream_date if missing
            if (!enriched.last_stream_date) {
              try {
                const vods = await this.twitchService.getChannelVODs(channel.twitch_id);
                if (vods && vods.length > 0) {
                  enriched.last_stream_date = vods[0].created_at;
                }
              } catch (e) {
                logger.warn(`Could not fetch VODs for ${channel.username}`);
              }
            }

            return enriched;
          } catch (error) {
            logger.error(`Error enriching channel ${channel.username}:`, error);
            return channel;
          }
        })
      );

      res.json({
        channels: updatedChannels,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error fetching channels:', error);
      next(new ChannelError('Failed to fetch channels', 500));
    }
  };

  addChannel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const channelData = req.body as CreateChannelRequest;

      const result = await withTransaction(this.pool, async (client) => {
        // Check for existing channel
        const existingChannel = await client.query(
          'SELECT id FROM channels WHERE twitch_id = $1',
          [channelData.twitch_id]
        );

        if (existingChannel.rows.length > 0) {
          throw new ChannelError('Channel already exists', 409);
        }

        // Get fresh follower count from Twitch
        try {
          const followerCount = await this.twitchService.getChannelFollowers(channelData.twitch_id);
          channelData.follower_count = followerCount;
        } catch (error) {
          logger.warn(`Could not fetch follower count for channel ${channelData.username}:`, error);
          // Continue with provided follower count or 0
          channelData.follower_count = channelData.follower_count || 0;
        }

        // Insert new channel
        const result = await client.query(`
          INSERT INTO channels (
            twitch_id,
            username,
            display_name,
            profile_image_url,
            description,
            follower_count,
            is_active,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING *`,
          [
            channelData.twitch_id,
            channelData.username,
            channelData.display_name || channelData.username,
            channelData.profile_image_url,
            channelData.description,
            channelData.follower_count,
            true
          ]
        );

        logger.info(`Channel created successfully: ${channelData.username}`);
        return result.rows[0];
      });

      res.status(201).json(result);

      // Index channel for discovery in background (non-blocking)
      try {
        const indexer = DiscoveryIndexer.getInstance(this.pool);
        // 'result' here is the channel object returned from the transaction
        indexer.indexChannel(result.id, result.twitch_id).catch(err =>
          logger.warn('Background discovery indexing failed:', err)
        );
      } catch (e) {
        logger.warn('Could not start discovery indexing:', e);
      }
    } catch (error) {
      if (error instanceof ChannelError) {
        next(error);
      } else {
        logger.error('Error adding channel:', error);
        next(new ChannelError('Failed to add channel', 500));
      }
    }
  };

  updateChannel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updates = req.body as UpdateChannelRequest;

      const result = await withTransaction(this.pool, async (client) => {
        // Check if channel exists
        const existingChannel = await client.query(
          'SELECT id FROM channels WHERE id = $1',
          [id]
        );

        if (existingChannel.rows.length === 0) {
          throw new ChannelError('Channel not found', 404);
        }

        // Build update query dynamically based on provided fields
        const updateFields: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        Object.entries(updates).forEach(([key, value]) => {
          if (value !== undefined) {
            updateFields.push(`${key} = $${paramCount}`);
            values.push(value);
            paramCount++;
          }
        });

        // Add updated_at to the update
        updateFields.push('updated_at = CURRENT_TIMESTAMP');

        // Add the ID as the last parameter
        values.push(id);

        const result = await client.query(`
          UPDATE channels 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramCount}
          RETURNING *`,
          values
        );

        return result.rows[0];
      });

      res.json(result);
    } catch (error) {
      if (error instanceof ChannelError) {
        next(error);
      } else {
        logger.error('Error updating channel:', error);
        next(new ChannelError('Failed to update channel', 500));
      }
    }
  };

  deleteChannel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      await withTransaction(this.pool, async (client) => {
        // First verify the channel exists
        const channelCheck = await client.query(
          'SELECT id FROM channels WHERE id = $1',
          [id]
        );

        if (channelCheck.rows.length === 0) {
          throw new ChannelError('Channel not found', 404);
        }

        // Delete related records from dependent tables (if they exist)
        try {
          await client.query('DELETE FROM channel_game_history WHERE channel_id = $1', [id]);
          await client.query('DELETE FROM channel_game_stats WHERE channel_id = $1', [id]);
        } catch (error) {
          // Tables might not exist, continue with channel deletion
          logger.warn('Could not delete from dependent tables:', error instanceof Error ? error.message : 'Unknown error');
        }

        // Delete the channel
        await client.query(
          'DELETE FROM channels WHERE id = $1',
          [id]
        );

        logger.info(`Channel ${id} deleted successfully`);
      });

      res.json({ message: 'Channel deleted successfully' });
    } catch (error) {
      if (error instanceof ChannelError) {
        next(error);
      } else {
        logger.error('Error deleting channel:', error);
        next(new ChannelError('Failed to delete channel', 500));
      }
    }
  };

  getChannelStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const result = await this.pool.query(`
        SELECT 
          c.*,
          COALESCE(json_build_object(
            'total_streams', COUNT(DISTINCT cgh.id),
            'total_hours', EXTRACT(EPOCH FROM SUM(cgh.duration))/3600,
            'average_viewers', AVG(cgh.viewer_count),
            'peak_viewers', MAX(cgh.peak_viewers)
          ), '{}') as stats
        FROM channels c
        LEFT JOIN channel_game_history cgh ON c.id = cgh.channel_id
        WHERE c.id = $1
        GROUP BY c.id
      `, [id]);

      if (result.rows.length === 0) {
        throw new ChannelError('Channel not found', 404);
      }

      res.json(result.rows[0]);
    } catch (error) {
      if (error instanceof ChannelError) {
        next(error);
      } else {
        logger.error('Error fetching channel stats:', error);
        next(new ChannelError('Failed to fetch channel stats', 500));
      }
    }
  };
}

export default ChannelsController;

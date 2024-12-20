// Filepath: backend/src/routes/games/controller.ts

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { twitchAPI } from '../../services/twitch/api';
import { withTransaction } from '../../middleware/withTransaction';
import {
  GameError,
  Game,
  CreateGameRequest,
  UpdateGameRequest,
  validateGameData,
  GameStatsRequest
} from './validation';

export class GamesController {
  constructor(private pool: Pool) {}

  searchGames = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query } = req.query;

      const games = await twitchAPI.searchGames(query as string);

      // Cache results for 5 minutes
      res.set('Cache-Control', 'public, max-age=300');
      res.json(games);
    } catch (error) {
      logger.error('Error searching games:', error);
      next(new GameError('Failed to search games', 500));
    }
  };

  getAllGames = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;

      const result = await withTransaction(this.pool, async (client) => {
        // Get total count
        const countResult = await client.query(
          'SELECT COUNT(*) FROM games WHERE is_active = true'
        );
        const total = parseInt(countResult.rows[0].count);

        // Get paginated games with related data
        const gamesResult = await client.query(`
          WITH game_stats AS (
            SELECT 
              game_id,
              COUNT(DISTINCT channel_id) as total_channels,
              COUNT(*) as total_streams,
              SUM(duration) as total_duration,
              AVG(viewer_count) as avg_viewers,
              MAX(peak_viewers) as peak_viewers
            FROM channel_game_history
            WHERE started_at > NOW() - INTERVAL '30 days'
            GROUP BY game_id
          )
          SELECT 
            g.*,
            COALESCE(gs.total_channels, 0) as total_channels,
            COALESCE(gs.total_streams, 0) as total_streams,
            COALESCE(EXTRACT(EPOCH FROM gs.total_duration)/3600, 0) as total_hours,
            COALESCE(gs.avg_viewers, 0) as average_viewers,
            COALESCE(gs.peak_viewers, 0) as peak_viewers,
            EXISTS (
              SELECT 1 FROM premiere_events pe 
              WHERE pe.game_id = g.id 
              AND pe.start_time > NOW()
            ) as has_upcoming_premieres
          FROM games g
          LEFT JOIN game_stats gs ON g.id = gs.game_id
          WHERE g.is_active = true
          ORDER BY 
            gs.total_streams DESC NULLS LAST,
            g.name ASC
          LIMIT $1 OFFSET $2
        `, [limit, offset]);

        return {
          games: gamesResult.rows,
          pagination: {
            total,
            page,
            limit,
            hasMore: offset + gamesResult.rows.length < total
          }
        };
      });

      // Cache results for 1 minute
      res.set('Cache-Control', 'public, max-age=60');
      res.json(result);
    } catch (error) {
      logger.error('Error fetching games:', error);
      next(new GameError('Failed to fetch games', 500));
    }
  };

  addGame = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gameData = req.body as CreateGameRequest['body'];

      // Validate input data
      validateGameData(gameData);

      const result = await withTransaction(this.pool, async (client) => {
        // Check for existing game
        const existingGame = await client.query(
          'SELECT id FROM games WHERE twitch_game_id = $1',
          [gameData.twitch_game_id]
        );

        if (existingGame.rows.length > 0) {
          // If game exists but is inactive, reactivate it
          if (!existingGame.rows[0].is_active) {
            const reactivated = await client.query(`
              UPDATE games 
              SET 
                is_active = true,
                name = $2,
                box_art_url = $3,
                igdb_id = $4,
                genres = $5,
                status = 'active',
                updated_at = CURRENT_TIMESTAMP
              WHERE twitch_game_id = $1
              RETURNING *
            `, [
              gameData.twitch_game_id,
              gameData.name,
              gameData.box_art_url,
              gameData.igdb_id,
              gameData.genres
            ]);
            return reactivated.rows[0];
          }
          throw new GameError('Game already exists', 409);
        }

        // Insert new game
        const result = await client.query(`
          INSERT INTO games (
            twitch_game_id,
            name,
            box_art_url,
            igdb_id,
            genres,
            is_active,
            status,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING *`,
          [
            gameData.twitch_game_id,
            gameData.name,
            gameData.box_art_url,
            gameData.igdb_id,
            gameData.genres,
            gameData.is_active || true,
            gameData.status || 'active'
          ]
        );

        logger.info(`Game created successfully: ${gameData.name}`);
        return result.rows[0];
      });

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof GameError) {
        next(error);
      } else {
        logger.error('Error adding game:', error);
        next(new GameError('Failed to add game', 500));
      }
    }
  };

  updateGame = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updates = req.body as UpdateGameRequest['body'];

      const result = await withTransaction(this.pool, async (client) => {
        // Check if game exists
        const existingGame = await client.query(
          'SELECT id FROM games WHERE id = $1',
          [id]
        );

        if (existingGame.rows.length === 0) {
          throw new GameError('Game not found', 404);
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
          UPDATE games 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramCount}
          RETURNING *`,
          values
        );

        return result.rows[0];
      });

      res.json(result);
    } catch (error) {
      if (error instanceof GameError) {
        next(error);
      } else {
        logger.error('Error updating game:', error);
        next(new GameError('Failed to update game', 500));
      }
    }
  };

  deleteGame = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      await withTransaction(this.pool, async (client) => {
        // First verify the game exists
        const gameCheck = await client.query(
          'SELECT id FROM games WHERE id = $1',
          [id]
        );

        if (gameCheck.rows.length === 0) {
          throw new GameError('Game not found', 404);
        }

        // Soft delete by setting is_active to false
        await client.query(`
          UPDATE games
          SET 
            is_active = false,
            status = 'inactive',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [id]);

        logger.info(`Game ${id} deactivated successfully`);
      });

      res.json({ message: 'Game deactivated successfully' });
    } catch (error) {
      if (error instanceof GameError) {
        next(error);
      } else {
        logger.error('Error deleting game:', error);
        next(new GameError('Failed to delete game', 500));
      }
    }
  };

  getGameStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const timeframe = (req.query.timeframe as string) || 'month';
      const includeChannels = req.query.include_channels === 'true';

      const result = await withTransaction(this.pool, async (client) => {
        // Verify game exists
        const gameCheck = await client.query(
          'SELECT id FROM games WHERE id = $1',
          [id]
        );

        if (gameCheck.rows.length === 0) {
          throw new GameError('Game not found', 404);
        }

        // Get time interval based on timeframe
        const timeInterval = {
          day: "INTERVAL '24 hours'",
          week: "INTERVAL '7 days'",
          month: "INTERVAL '30 days'",
          year: "INTERVAL '365 days'",
          all: "INTERVAL '100 years'"
        }[timeframe];

        // Get game statistics
        const statsResult = await client.query(`
          WITH game_streams AS (
            SELECT 
              channel_id,
              COUNT(*) as stream_count,
              SUM(duration) as total_duration,
              AVG(viewer_count) as avg_viewers,
              MAX(peak_viewers) as peak_viewers,
              MAX(started_at) as last_stream
            FROM channel_game_history
            WHERE game_id = $1
            AND started_at > NOW() - ${timeInterval}
            GROUP BY channel_id
          ),
          timeframe_stats AS (
            SELECT 
              date_trunc('day', started_at) as date,
              COUNT(*) as streams,
              SUM(duration) as duration,
              AVG(viewer_count) as viewers
            FROM channel_game_history
            WHERE game_id = $1
            AND started_at > NOW() - ${timeInterval}
            GROUP BY date_trunc('day', started_at)
          )
          SELECT json_build_object(
            'streams', json_build_object(
              'total', COUNT(DISTINCT gs.channel_id),
              'unique_channels', COUNT(DISTINCT gs.channel_id),
              'total_hours', EXTRACT(EPOCH FROM SUM(gs.total_duration))/3600,
              'average_viewers', AVG(gs.avg_viewers),
              'peak_viewers', MAX(gs.peak_viewers)
            ),
            'channels', CASE WHEN $2 THEN (
              SELECT json_agg(channel_data)
              FROM (
                SELECT 
                  c.id,
                  c.username,
                  c.display_name,
                  c.profile_image_url,
                  gs.stream_count as total_streams,
                  EXTRACT(EPOCH FROM gs.total_duration)/3600 as total_hours,
                  gs.avg_viewers as average_viewers,
                  gs.last_stream
                FROM game_streams gs
                JOIN channels c ON c.id = gs.channel_id
                ORDER BY gs.stream_count DESC
                LIMIT 10
              ) channel_data
            ) ELSE NULL END,
            'timeframes', (
              SELECT json_object_agg(
                ts.date::text,
                json_build_object(
                  'streams', ts.streams,
                  'hours', EXTRACT(EPOCH FROM ts.duration)/3600,
                  'viewers', ts.viewers
                )
              )
              FROM timeframe_stats ts
            )
          ) as stats
          FROM game_streams gs
        `, [id, includeChannels]);

        const stats = statsResult.rows[0]?.stats || {
          streams: {
            total: 0,
            unique_channels: 0,
            total_hours: 0,
            average_viewers: 0,
            peak_viewers: 0
          },
          channels: [],
          timeframes: {}
        };

        return stats;
      });

      // Cache results for 5 minutes
      res.set('Cache-Control', 'public, max-age=300');
      res.json(result);
    } catch (error) {
      if (error instanceof GameError) {
        next(error);
      } else {
        logger.error('Error fetching game stats:', error);
        next(new GameError('Failed to fetch game stats', 500));
      }
    }
  };
}

export default GamesController;

// Filepath: backend/src/routes/games/validation.ts

import { z } from 'zod';
import { logger } from '../../utils/logger';

// Base game schema
const gameBaseSchema = {
  twitch_game_id: z.string().min(1, 'Twitch game ID is required').max(50, 'Twitch game ID is too long'),
  name: z.string().min(1, 'Name is required').max(200, 'Name is too long'),
  box_art_url: z.string().url('Invalid box art URL'),
  igdb_id: z.string().optional(),
  genres: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  status: z.enum(['active', 'inactive', 'ignored']).optional()
};

// Search request schema
export const SearchGameSchema = z.object({
  query: z.object({
    query: z.string().min(1, 'Search query is required').max(100, 'Search query is too long')
  })
});

// Create game request schema
export const CreateGameSchema = z.object({
  body: z.object(gameBaseSchema)
});

// Update game request schema
export const UpdateGameSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid game ID')
  }),
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    box_art_url: z.string().url().optional(),
    is_active: z.boolean().optional(),
    status: z.enum(['active', 'inactive', 'ignored']).optional(),
    genres: z.array(z.string()).optional()
  })
});

// Delete game request schema
export const DeleteGameSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid game ID')
  })
});

// Get game stats schema
export const GameStatsSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid game ID')
  }),
  query: z.object({
    timeframe: z.enum(['day', 'week', 'month', 'year', 'all']).optional(),
    include_channels: z.string().regex(/^(true|false)$/).transform(val => val === 'true').optional()
  }).optional()
});

// Custom error class
export class GameError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'GameError';
  }
}

// Response types
export interface Game {
  id: number;
  twitch_game_id: string;
  name: string;
  box_art_url: string;
  igdb_id?: string;
  genres?: string[];
  is_active: boolean;
  status: 'active' | 'inactive' | 'ignored';
  created_at: Date;
  updated_at: Date;
  stats?: {
    total_channels: number;
    total_streams: number;
    total_hours: number;
    average_viewers: number;
    peak_viewers: number;
  };
}

export interface GameListResponse {
  games: Game[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

export interface GameStats {
  streams: {
    total: number;
    unique_channels: number;
    total_hours: number;
    average_viewers: number;
    peak_viewers: number;
  };
  channels: Array<{
    id: number;
    username: string;
    display_name: string;
    profile_image_url: string;
    total_streams: number;
    total_hours: number;
    average_viewers: number;
  }>;
  timeframes: {
    [key: string]: {
      streams: number;
      hours: number;
      viewers: number;
    };
  };
}

// Validation helper functions
export const validateGameData = (data: z.infer<typeof CreateGameSchema>['body']): void => {
  try {
    CreateGameSchema.shape.body.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Game validation failed:', {
        errors: error.errors,
        data
      });
      throw new GameError('Invalid game data', 400, error.errors);
    }
    throw error;
  }
};

// Type exports
export type SearchGameRequest = z.infer<typeof SearchGameSchema>;
export type CreateGameRequest = z.infer<typeof CreateGameSchema>;
export type UpdateGameRequest = z.infer<typeof UpdateGameSchema>;
export type DeleteGameRequest = z.infer<typeof DeleteGameSchema>;
export type GameStatsRequest = z.infer<typeof GameStatsSchema>;

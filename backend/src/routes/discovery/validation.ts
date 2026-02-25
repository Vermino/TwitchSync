// Filepath: backend/src/routes/discovery/validation.ts

import { z } from 'zod';
import { logger } from '../../utils/logger';

// Base schemas
const gameSchema = z.object({
  id: z.string(),
  name: z.string(),
  box_art_url: z.string().url(),
  igdb_id: z.string().optional(),
  genres: z.array(z.string()).optional()
});

const channelSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  login: z.string(),
  profile_image_url: z.string().url(),
  description: z.string().optional(),
  viewer_count: z.number().int().nonnegative(),
  compatibility_score: z.number().min(0).max(1)
});

// Discovery preferences schema
export const DiscoveryPreferencesSchema = z.object({
  min_viewers: z.number().int().min(0),
  max_viewers: z.number().int().min(0),
  preferred_languages: z.array(z.string().length(2)),
  content_rating: z.enum(['all', 'family', 'mature']),
  notify_only: z.boolean(),
  schedule_match: z.boolean(),
  confidence_threshold: z.number().min(0).max(1)
}).refine(data => data.min_viewers < data.max_viewers, {
  message: "min_viewers must be less than max_viewers",
  path: ["min_viewers"]
});

// Premiere tracking schema
export const PremiereTrackingSchema = z.object({
  premiere_id: z.string(),
  quality: z.enum(['best', 'source', '1080p', '720p', '480p']),
  retention_days: z.number().int().min(1).max(365),
  notify: z.boolean().default(true)
});

// Feed filters schema
export const FeedFiltersSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  game_ids: z.string().transform(ids => ids.split(',')).optional(),
  min_viewers: z.string().regex(/^\d+$/).transform(Number).optional(),
  max_viewers: z.string().regex(/^\d+$/).transform(Number).optional(),
  languages: z.string().transform(langs => langs.split(',')).optional()
});

// Custom error class
export class DiscoveryError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'DiscoveryError';
  }
}

// Response types
export interface DiscoveryPreferences {
  min_viewers: number;
  max_viewers: number;
  preferred_languages: string[];
  content_rating: 'all' | 'family' | 'mature';
  notify_only: boolean;
  schedule_match: boolean;
  confidence_threshold: number;
}

export interface PremiereEvent {
  id: string;
  channel_id: string;
  game_id: string;
  title: string;
  start_time: Date;
  duration: number;
  viewer_prediction: number;
  confidence_score: number;
  detected_at: Date;
  is_tracked: boolean;
  channel: {
    username: string;
    display_name: string;
    profile_image_url: string;
  };
  game: {
    name: string;
    box_art_url: string;
  };
}

export interface DiscoveryFeed {
  preferences: DiscoveryPreferences;
  premieres: PremiereEvent[];
  risingChannels: Array<{
    id: string;
    username: string;
    display_name: string;
    profile_image_url: string;
    viewer_growth_rate: number;
    current_game?: {
      id: string;
      name: string;
      box_art_url: string;
    };
    stats: {
      avg_viewers: number;
      growth_rate: number;
      recorded_vods: number;
    };
  }>;
  recommendations: {
    channels: Array<{
      id: string;
      username: string;
      display_name: string;
      profile_image_url: string;
      current_game?: {
        id: string;
        name: string;
      };
      compatibility_score: number;
    }>;
    games: Array<{
      id: string;
      name: string;
      box_art_url: string;
      compatibility_score: number;
      upcoming_premieres: number;
    }>;
  };
}

// Validation helper functions
export const validatePremiereExists = async (
  pool: any,
  premiereId: string
): Promise<boolean> => {
  const result = await pool.query(
    'SELECT id FROM premiere_events WHERE id = $1',
    [premiereId]
  );
  return result.rows.length > 0;
};

export const validateDiscoveryPreferences = (
  data: z.infer<typeof DiscoveryPreferencesSchema>
): void => {
  try {
    DiscoveryPreferencesSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Discovery preferences validation failed:', {
        errors: error.errors,
        data
      });
      throw new DiscoveryError('Invalid discovery preferences', 400, error.errors);
    }
    throw error;
  }
};

export type DiscoveryPreferencesRequest = { body: z.infer<typeof DiscoveryPreferencesSchema> };
export type PremiereTrackingRequest = { body: z.infer<typeof PremiereTrackingSchema> };
export type FeedFiltersRequest = { query: z.infer<typeof FeedFiltersSchema> };

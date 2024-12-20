// Filepath: backend/src/routes/channels/validation.ts

import { z } from 'zod';
import { logger } from '../../utils/logger';

// Base channel schema
const channelBaseSchema = {
  twitch_id: z.string().min(1, 'Twitch ID is required').max(50, 'Twitch ID is too long'),
  username: z.string().min(1, 'Username is required').max(100, 'Username is too long'),
  display_name: z.string().max(100, 'Display name is too long').optional(),
  profile_image_url: z.string().url('Invalid profile image URL').optional(),
  description: z.string().max(1000, 'Description is too long').optional(),
  follower_count: z.number().int('Follower count must be an integer').nonnegative().optional(),
  is_active: z.boolean().optional()
};

// Search request schema
export const SearchChannelSchema = z.object({
  query: z.object({
    query: z.string().min(1, 'Search query is required').max(100, 'Search query is too long')
  })
});

// Create channel request schema
export const CreateChannelSchema = z.object({
  body: z.object(channelBaseSchema)
});

// Update channel request schema
export const UpdateChannelSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid channel ID')
  }),
  body: z.object({
    is_active: z.boolean(),
    display_name: z.string().max(100).optional(),
    profile_image_url: z.string().url().optional(),
    description: z.string().max(1000).optional()
  })
});

// Delete channel request schema
export const DeleteChannelSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Invalid channel ID')
  })
});

// Channel error class
export class ChannelError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'ChannelError';
  }
}

// Validation helper functions
export const validateChannelId = (id: string): string | null => {
  const channelId = parseInt(id);
  if (isNaN(channelId) || channelId <= 0) {
    return 'Invalid channel ID';
  }
  return null;
};

export const validateChannelData = (data: z.infer<typeof CreateChannelSchema>['body']): void => {
  try {
    CreateChannelSchema.shape.body.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Channel validation failed:', {
        errors: error.errors,
        data
      });
      throw new ChannelError('Invalid channel data', 400, error.errors);
    }
    throw error;
  }
};

// Type exports
export type SearchChannelRequest = z.infer<typeof SearchChannelSchema>;
export type CreateChannelRequest = z.infer<typeof CreateChannelSchema>;
export type UpdateChannelRequest = z.infer<typeof UpdateChannelSchema>;
export type DeleteChannelRequest = z.infer<typeof DeleteChannelSchema>;

// Response types
export interface Channel {
  id: number;
  twitch_id: string;
  username: string;
  display_name: string;
  profile_image_url?: string;
  description?: string;
  follower_count: number;
  is_active: boolean;
  is_live?: boolean;
  last_stream_date?: string;
  created_at: Date;
  updated_at: Date;
  game_data?: {
    current_game?: {
      id: string;
      name: string;
      box_art_url: string;
    };
    most_played?: {
      id: string;
      name: string;
      box_art_url: string;
      hours: number;
    };
  };
  stats?: {
    total_streams: number;
    total_hours: number;
    average_viewers: number;
    peak_viewers: number;
  };
}

export interface ChannelListResponse {
  channels: Channel[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

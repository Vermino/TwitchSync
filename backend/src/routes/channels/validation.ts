// backend/src/routes/channels/validation.ts

import { CreateChannelRequest } from '../../types/database';

export const validateChannelData = (data: Partial<CreateChannelRequest>): string | null => {
  // Required fields validation
  if (!data.twitch_id) {
    return 'Twitch ID is required';
  }

  if (!data.username) {
    return 'Username is required';
  }

  // Length validations
  if (data.twitch_id.length > 50) {
    return 'Twitch ID is too long (maximum 50 characters)';
  }

  if (data.username.length > 100) {
    return 'Username is too long (maximum 100 characters)';
  }

  if (data.display_name && data.display_name.length > 100) {
    return 'Display name is too long (maximum 100 characters)';
  }

  if (data.description && data.description.length > 1000) {
    return 'Description is too long (maximum 1000 characters)';
  }

  // URL validation for profile image
  if (data.profile_image_url) {
    try {
      new URL(data.profile_image_url);
    } catch (e) {
      return 'Invalid profile image URL';
    }
  }

  // Numeric validations
  if (data.follower_count !== undefined) {
    if (!Number.isInteger(data.follower_count) || data.follower_count < 0) {
      return 'Follower count must be a non-negative integer';
    }
  }

  return null;
};

export const validateChannelId = (id: string): string | null => {
  const channelId = parseInt(id);
  if (isNaN(channelId) || channelId <= 0) {
    return 'Invalid channel ID';
  }
  return null;
};

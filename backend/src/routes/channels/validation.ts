// backend/src/routes/channels/validation.ts

import { CreateChannelRequest } from '../../types/database';

export const validateChannelData = (data: Partial<CreateChannelRequest>): string | null => {
  if (!data.twitch_id) {
    return 'Twitch ID is required';
  }

  if (!data.username) {
    return 'Username is required';
  }

  if (data.twitch_id.length > 50) {
    return 'Twitch ID is too long';
  }

  if (data.username.length > 100) {
    return 'Username is too long';
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

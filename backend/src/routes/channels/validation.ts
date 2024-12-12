import { CreateChannelRequest, UpdateChannelRequest } from '../../types/database';

export function validateChannelData(data: CreateChannelRequest): string | null {
  const { twitch_id, username } = data;

  if (!twitch_id || typeof twitch_id !== 'string') {
    return 'Invalid or missing twitch_id';
  }

  if (!username || typeof username !== 'string') {
    return 'Invalid or missing username';
  }

  if (username.length < 2 || username.length > 100) {
    return 'Username must be between 2 and 100 characters';
  }

  // Twitch username validation regex
  const usernameRegex = /^[a-zA-Z0-9][\w]{2,24}$/;
  if (!usernameRegex.test(username)) {
    return 'Invalid username format';
  }

  return null;
}

export function validateUpdateChannelData(data: UpdateChannelRequest): string | null {
  const { is_active, current_game_id } = data;

  if (typeof is_active !== 'undefined' && typeof is_active !== 'boolean') {
    return 'is_active must be a boolean';
  }

  if (typeof current_game_id !== 'undefined' && current_game_id !== null) {
    if (typeof current_game_id !== 'string') {
      return 'current_game_id must be a string or null';
    }
  }

  return null;
}

export function validateChannelId(id: string): string | null {
  if (!id || isNaN(parseInt(id))) {
    return 'Invalid channel ID';
  }

  return null;
}

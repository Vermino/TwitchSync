import { CreateGameRequest, UpdateGameRequest } from '../../types/database';

export function validateGameData(data: CreateGameRequest): string | null {
  const { twitch_game_id, name } = data;

  if (!twitch_game_id || typeof twitch_game_id !== 'string') {
    return 'Invalid or missing twitch_game_id';
  }

  if (!name || typeof name !== 'string') {
    return 'Invalid or missing name';
  }

  if (name.length < 1 || name.length > 200) {
    return 'Name must be between 1 and 200 characters';
  }

  return null;
}

export function validateUpdateGameData(data: UpdateGameRequest): string | null {
  const { is_active, name } = data;

  if (typeof is_active !== 'undefined' && typeof is_active !== 'boolean') {
    return 'is_active must be a boolean';
  }

  if (typeof name !== 'undefined') {
    if (typeof name !== 'string') {
      return 'name must be a string';
    }
    if (name.length < 1 || name.length > 200) {
      return 'Name must be between 1 and 200 characters';
    }
  }

  return null;
}

export function validateGameId(id: string): string | null {
  if (!id || isNaN(parseInt(id))) {
    return 'Invalid game ID';
  }

  return null;
}

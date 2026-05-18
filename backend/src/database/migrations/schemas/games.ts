import { Pool } from 'pg';
// @ts-ignore - Types will be resolved at runtime
import { Game } from '../../types/database';

export const gamesQueries = {
  CREATE_TABLE: `
    CREATE TABLE IF NOT EXISTS tracked_games (
      id SERIAL PRIMARY KEY,
      twitch_game_id VARCHAR(50) NOT NULL,
      name VARCHAR(200) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      last_checked TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tracked_games_twitch_id ON tracked_games(twitch_game_id);
  `,

  getAllGames: async (pool: Pool): Promise<Game[]> => {
    const result = await pool.query<Game>('SELECT * FROM tracked_games ORDER BY name ASC');
    return result.rows;
  },

  getGameById: async (pool: Pool, id: number): Promise<Game | null> => {
    const result = await pool.query<Game>('SELECT * FROM tracked_games WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  getGameByTwitchId: async (pool: Pool, twitchGameId: string): Promise<Game | null> => {
    const result = await pool.query<Game>(
      'SELECT * FROM tracked_games WHERE twitch_game_id = $1',
      [twitchGameId]
    );
    return result.rows[0] || null;
  },

  createGame: async (pool: Pool, data: Omit<Game, 'id' | 'created_at'>): Promise<Game> => {
    const result = await pool.query<Game>(
      `INSERT INTO tracked_games (twitch_game_id, name, is_active) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [data.twitch_game_id, data.name, data.is_active]
    );
    return result.rows[0];
  },

  updateGame: async (pool: Pool, id: number, data: Partial<Game>): Promise<Game | null> => {
    const setClause = Object.keys(data)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(data);
    const result = await pool.query<Game>(
      `UPDATE tracked_games SET ${setClause} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return result.rows[0] || null;
  },

  deleteGame: async (pool: Pool, id: number): Promise<boolean> => {
    const result = await pool.query('DELETE FROM tracked_games WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  updateLastChecked: async (pool: Pool, id: number): Promise<void> => {
    await pool.query(
      'UPDATE tracked_games SET last_checked = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }
};

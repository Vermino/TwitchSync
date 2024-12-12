import { Pool } from 'pg';
import { VOD } from '../types';

export const vodsQueries = {
  CREATE_TABLE: `
    CREATE TABLE IF NOT EXISTS vods (
      id SERIAL PRIMARY KEY,
      twitch_vod_id VARCHAR(50) NOT NULL UNIQUE,
      channel_id INTEGER REFERENCES channels(id),
      game_id VARCHAR(50),
      title VARCHAR(500),
      duration VARCHAR(20),
      view_count INTEGER,
      created_at TIMESTAMP,
      published_at TIMESTAMP,
      type VARCHAR(20),
      url VARCHAR(500),
      thumbnail_url VARCHAR(500),
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_vods_twitch_id ON vods(twitch_vod_id);
    CREATE INDEX IF NOT EXISTS idx_vods_channel_id ON vods(channel_id);
    CREATE INDEX IF NOT EXISTS idx_vods_game_id ON vods(game_id);
  `,

  getVODs: async (pool: Pool, page: number = 1, limit: number = 20): Promise<{ vods: VOD[]; total: number }> => {
    const offset = (page - 1) * limit;
    const [vods, countResult] = await Promise.all([
      pool.query<VOD>(
        `SELECT v.*, c.username as channel_name 
         FROM vods v 
         LEFT JOIN channels c ON v.channel_id = c.id 
         ORDER BY created_at DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query('SELECT COUNT(*) FROM vods')
    ]);

    return {
      vods: vods.rows,
      total: parseInt(countResult.rows[0].count)
    };
  },

  getVODById: async (pool: Pool, id: number): Promise<VOD | null> => {
    const result = await pool.query<VOD>(
      `SELECT v.*, c.username as channel_name 
       FROM vods v 
       LEFT JOIN channels c ON v.channel_id = c.id 
       WHERE v.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  getChannelVODs: async (pool: Pool, channelId: number): Promise<VOD[]> => {
    const result = await pool.query<VOD>(
      'SELECT * FROM vods WHERE channel_id = $1 ORDER BY created_at DESC',
      [channelId]
    );
    return result.rows;
  },

  createVOD: async (pool: Pool, data: Omit<VOD, 'id' | 'created_at' | 'processed_at'>): Promise<VOD> => {
    const result = await pool.query<VOD>(
      `INSERT INTO vods (
        twitch_vod_id, channel_id, game_id, title, duration,
        view_count, published_at, type, url, thumbnail_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING *`,
      [
        data.twitch_vod_id, data.channel_id, data.game_id, data.title,
        data.duration, data.view_count, data.published_at, data.type,
        data.url, data.thumbnail_url
      ]
    );
    return result.rows[0];
  },

  updateVOD: async (pool: Pool, id: number, data: Partial<VOD>): Promise<VOD | null> => {
    const setClause = Object.keys(data)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(data);
    const result = await pool.query<VOD>(
      `UPDATE vods SET ${setClause} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return result.rows[0] || null;
  },

  deleteVOD: async (pool: Pool, id: number): Promise<boolean> => {
    const result = await pool.query('DELETE FROM vods WHERE id = $1', [id]);
    return result.rowCount > 0;
  }
};

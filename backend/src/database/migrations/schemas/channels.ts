// src/database/migrations/schemas/channels.ts

import { Pool } from 'pg';
import { Channel } from '../../../types/database';

export const channelQueries = {
    CREATE_TABLE: `
        CREATE TABLE IF NOT EXISTS channels (
            id SERIAL PRIMARY KEY,
            twitch_id VARCHAR(50) NOT NULL,
            username VARCHAR(100) NOT NULL,
            is_active BOOLEAN DEFAULT true,
            last_vod_check TIMESTAMP,
            last_game_check TIMESTAMP,
            current_game_id VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_channels_twitch_id ON channels(twitch_id);
        CREATE INDEX IF NOT EXISTS idx_channels_username ON channels(username);
    `,

    getAllChannels: async (pool: Pool): Promise<Channel[]> => {
        const result = await pool.query<Channel>(
            'SELECT * FROM channels ORDER BY created_at DESC'
        );
        return result.rows;
    },

    getChannelById: async (pool: Pool, id: number): Promise<Channel | null> => {
        const result = await pool.query<Channel>(
            'SELECT * FROM channels WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    },

    createChannel: async (
        pool: Pool,
        data: Omit<Channel, 'id' | 'created_at'>
    ): Promise<Channel> => {
        const result = await pool.query<Channel>(
            `INSERT INTO channels (
                twitch_id, username, is_active
            ) VALUES ($1, $2, $3) 
            RETURNING *`,
            [data.twitch_id, data.username, data.is_active]
        );
        return result.rows[0];
    },

    updateChannel: async (
        pool: Pool,
        id: number,
        data: Partial<Channel>
    ): Promise<Channel | null> => {
        const setClause = Object.keys(data)
            .map((key, index) => `${key} = $${index + 2}`)
            .join(', ');

        const values = Object.values(data);
        const result = await pool.query<Channel>(
            `UPDATE channels SET ${setClause} WHERE id = $1 RETURNING *`,
            [id, ...values]
        );
        return result.rows[0] || null;
    },

    deleteChannel: async (pool: Pool, id: number): Promise<boolean> => {
        const result = await pool.query(
            'DELETE FROM channels WHERE id = $1',
            [id]
        );
        return (result.rowCount ?? 0) > 0;
    },

    updateLastChecks: async (
        pool: Pool,
        id: number,
        type: 'vod' | 'game'
    ): Promise<void> => {
        const field = type === 'vod' ? 'last_vod_check' : 'last_game_check';
        await pool.query(
            `UPDATE channels SET ${field} = CURRENT_TIMESTAMP WHERE id = $1`,
            [id]
        );
    }
};

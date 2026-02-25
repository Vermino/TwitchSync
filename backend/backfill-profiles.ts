import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

import { TwitchService } from './src/services/twitch/service';

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'twitchsync',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
});

async function run() {
    const client = await pool.connect();
    const twitch = TwitchService.getInstance();
    try {
        // Find channels with no profile image
        const channels = await client.query('SELECT id, twitch_id, username FROM channels WHERE profile_image_url IS NULL OR profile_image_url = \'\'');
        console.log(`Found ${channels.rows.length} channels missing profile images.`);

        for (const c of channels.rows) {
            try {
                const info = await twitch.getChannelInfo(c.username);
                if (info && info.profile_image_url) {
                    await client.query('UPDATE channels SET profile_image_url = $1 WHERE id = $2', [info.profile_image_url, c.id]);
                    console.log(`Updated ${c.username} with profile image`);
                }
            } catch (e: any) {
                console.error(`Failed to fetch info for ${c.username}:`, e.message);
            }
        }
    } finally {
        client.release();
        pool.end();
    }
}

run().catch(console.error);

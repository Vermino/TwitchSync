import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'twitchsync',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '5435'),
});

async function run() {
    try {
        const vods = await pool.query('SELECT id, twitch_id, download_status, error_message FROM vods');
        console.log('vod errors:', vods.rows);

        const vfs = await pool.query('SELECT vod_id, operation_status, error_details FROM vod_file_states');
        console.log('vfs errors:', vfs.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();

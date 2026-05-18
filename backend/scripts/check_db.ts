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
        const vfs = await pool.query('SELECT vod_id, file_path, file_size_bytes, file_state, operation_status FROM vod_file_states');
        console.log('vod_file_states count:', vfs.rows.length);
        console.log('vod_file_states rows:', vfs.rows);

        // Check if there are tasks running
        const tasks = await pool.query('SELECT * FROM task_monitoring');
        console.log('tasks running:', tasks.rows);

        // Check vods
        const vods = await pool.query('SELECT id, download_status, file_size, download_progress, download_path FROM vods');
        console.log('vods rows:', vods.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();

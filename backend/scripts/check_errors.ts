import { Pool } from 'pg';

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'twitchsync',
    password: 'James2004!',
    port: 5435,
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

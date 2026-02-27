import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'twitchsync',
    password: 'James2004!',
    port: 5435,
});

const DOWNLOAD_DIR = 'C:/Users/jesse/TwitchSync/Downloads';

async function run() {
    try {
        const files = await fs.readdir(DOWNLOAD_DIR);

        for (const file of files) {
            if (!file.endsWith('.ts') && !file.endsWith('.mp4')) continue;

            const twitchId = file.split('_')[0];
            const filePath = path.join(DOWNLOAD_DIR, file);
            const stats = await fs.stat(filePath);
            const fileSizeBytes = stats.size;

            console.log(`Processing ${twitchId} - ${fileSizeBytes} bytes`);

            // Update vods table
            await pool.query(`
        UPDATE vods 
        SET download_status = 'completed', 
            download_path = $1, 
            file_size = $2, 
            download_progress = 100 
        WHERE twitch_id = $3
      `, [filePath, fileSizeBytes, twitchId]);

            // Update vod_file_states
            await pool.query(`
        UPDATE vod_file_states
        SET file_path = $1,
            file_size_bytes = $2,
            file_state = 'present',
            operation_status = 'completed',
            first_downloaded_at = NOW(),
            updated_at = NOW(),
            error_details = NULL
        WHERE twitch_vod_id = $3
      `, [filePath, fileSizeBytes, twitchId]);

            console.log(`Restored VOD: ${twitchId}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
dotenv.config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'twitchsync',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT || '5432'),
});

async function run() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
      SELECT id, task_id, twitch_id, download_path, file_size 
      FROM vods 
      WHERE download_status = 'completed' 
        AND id NOT IN (SELECT vod_id FROM vod_file_states)
    `);

        console.log(`Found ${result.rows.length} completed VODs missing file states.`);

        for (const vod of result.rows) {
            if (!vod.download_path) continue;

            let actualSize = vod.file_size ? parseInt(vod.file_size) : 0;
            let state = 'missing';

            try {
                const stats = await fs.stat(vod.download_path);
                actualSize = stats.size;
                state = 'present';
            } catch (err) {
                console.log(`File not found for VOD ${vod.id}: ${vod.download_path}`);
            }

            await client.query(`
        INSERT INTO vod_file_states (
          vod_id, task_id, twitch_vod_id, file_state, file_path, 
          file_size_bytes, operation_status, first_downloaded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'completed', NOW())
      `, [vod.id, vod.task_id, vod.twitch_id, state, vod.download_path, actualSize]);

            console.log(`Inserted state '${state}' for VOD ${vod.id} (${actualSize} bytes)`);
        }

        console.log("Sync complete!");
    } catch (err) {
        console.error("Error:", err);
    } finally {
        client.release();
        pool.end();
    }
}
run();

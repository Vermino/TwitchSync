import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'twitchsync',
    password: process.env.DB_PASSWORD || 'password',
    port: parseInt(process.env.DB_PORT || '5432'),
});

async function run() {
    try {
        const result = await pool.query(`
        SELECT 
          v.id,
          v.twitch_id,
          v.title,
          c.username as channel_name,
          c.display_name as channel_display_name,
          g.name as game_name,
          v.duration,
          v.created_at,
          v.updated_at,
          vfs.file_size_bytes,
          vfs.is_user_protected,
          fvh.created_at as last_verified_at
        FROM vods v
        JOIN tasks t ON v.task_id = t.id
        LEFT JOIN channels c ON v.channel_id = c.id  
        LEFT JOIN games g ON v.game_id = g.id
        LEFT JOIN vod_file_states vfs ON v.id = vfs.vod_id
        LEFT JOIN file_verification_history fvh ON vfs.id = fvh.file_state_id
        WHERE v.download_status = 'completed' AND vfs.file_state = 'present'
        ORDER BY CAST(COALESCE(vfs.file_size_bytes, '0') AS BIGINT) DESC, v.created_at DESC
        LIMIT 5
      `);
        console.log("Success:", result.rows);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        pool.end();
    }
}
run();

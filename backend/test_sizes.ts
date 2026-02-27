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
        const counts = await pool.query(`
      SELECT download_status, COUNT(*) 
      FROM vods 
      GROUP BY download_status
    `);
        console.log("VOD counts by status:", counts.rows);

        const completed = await pool.query(`
      SELECT id, title, download_status, file_size, download_path 
      FROM vods 
      WHERE download_status = 'completed'
      LIMIT 5
    `);
        console.log("Completed VODs:", completed.rows);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        pool.end();
    }
}
run();

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
});

async function main() {
    const client = await pool.connect();
    try {
        const res1 = await client.query('SELECT COUNT(*) FROM channels');
        console.log(`Total channels in DB: ${res1.rows[0].count}`);

        const res2 = await client.query('SELECT COUNT(*) FROM channel_game_stats');
        console.log(`Total channel_game_stats in DB: ${res2.rows[0].count}`);

        // Also how many users
        const res3 = await client.query('SELECT id, username FROM users LIMIT 1');
        const userId = res3.rows[0]?.id;
        if (userId) {
            const res4 = await client.query(`SELECT COUNT(*) FROM games WHERE is_active = true`);
            console.log(`Total tracked games: ${res4.rows[0].count}`);
        }

    } finally {
        client.release();
        pool.end();
    }
}

main().catch(console.error);

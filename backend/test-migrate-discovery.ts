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

async function migrate() {
    try {
        console.log('Adding preferred_game_ids column to discovery_preferences...');
        await pool.query(`
      ALTER TABLE discovery_preferences 
      ADD COLUMN IF NOT EXISTS preferred_game_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[];
    `);
        console.log('Migration successful.');
        await pool.end();
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();

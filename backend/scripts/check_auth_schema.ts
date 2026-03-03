import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5435'),
    database: process.env.DB_NAME || 'twitchsync',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'James2004!',
});

async function run() {
    try {
        console.log('--- Checking users table columns ---');
        const columns = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users'
            ORDER BY ordinal_position;
        `);
        console.table(columns.rows);

        console.log('--- Checking executed migrations ---');
        try {
            const migrations = await pool.query('SELECT name, executed_at FROM migrations ORDER BY id ASC');
            console.table(migrations.rows);
        } catch (e) {
            console.log('Migrations table not found or error querying it.');
        }

        console.log('--- Checking for broadcaster_type in users ---');
        const hasBroadcasterType = columns.rows.some(c => c.column_name === 'broadcaster_type');
        console.log('Has broadcaster_type:', hasBroadcasterType);

        const hasDisplayName = columns.rows.some(c => c.column_name === 'display_name');
        console.log('Has display_name:', hasDisplayName);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();

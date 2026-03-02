import * as dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';

const pool = new Pool({
    user: process.env.DB_USER, host: process.env.DB_HOST,
    database: process.env.DB_NAME, password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
});

async function main() {
    const r = await pool.query('SELECT name FROM migrations ORDER BY id ASC');
    console.log('Applied migrations:');
    r.rows.forEach(row => console.log(' -', row.name));
    await pool.end();
}

main().catch(console.error);

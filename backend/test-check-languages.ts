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

async function checkLanguages() {
    try {
        const result = await pool.query(`
      SELECT language, COUNT(*) 
      FROM channels 
      GROUP BY language 
      ORDER BY count DESC
    `);
        console.log('Language Distribution in Channels:');
        console.table(result.rows);
        await pool.end();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkLanguages();

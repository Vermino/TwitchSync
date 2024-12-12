import { Pool } from 'pg';
import dotenv from 'dotenv';
import { runMigrations } from '../../migrations/runner';  // Updated path to match actual structure
import { logger } from '../utils/logger';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export const setupDatabase = async () => {
  try {
    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    // Run migrations
    await runMigrations(pool);

    return true;
  } catch (error) {
    logger.error('Database setup failed:', error);
    throw error;
  }
};

export default pool;

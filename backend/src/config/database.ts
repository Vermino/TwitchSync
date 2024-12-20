// backend/src/config/database.ts
import { Pool } from 'pg';
import { config } from './index';
import { runMigrations } from '../database/migrations/runner';
import { logger } from '../utils/logger';

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl,
  max: config.database.max,
  idleTimeoutMillis: config.database.idleTimeoutMillis
});

export const setupDatabase = async () => {
  try {
    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    logger.info('Database connection established successfully');

    // Run migrations
    await runMigrations(pool);
    logger.info('Database migrations completed successfully');

    return true;
  } catch (error) {
    logger.error('Database setup failed:', error);
    throw error;
  }
};

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected database pool error:', err);
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

pool.on('remove', () => {
  logger.debug('Database connection removed from pool');
});

export default pool;

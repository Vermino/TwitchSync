// Filepath: backend/scripts/migrate.ts

import { Pool } from 'pg';
import { logger } from '../src/utils/logger';
import { runMigrations, rollbackAllMigrations } from '../src/database/migrations/runner';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME
});

async function main() {
  try {
    const shouldRollback = process.argv.includes('--rollback');
    const forceRollback = process.argv.includes('--force');

    if (shouldRollback) {
      logger.info('Rolling back all migrations...');
      await rollbackAllMigrations(pool, forceRollback);
      logger.info('Successfully rolled back all migrations');
    } else {
      logger.info('Running migrations...');
      await runMigrations(pool);
      logger.info('Successfully completed all migrations');
    }
  } catch (error) {
    logger.error('Migration script failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

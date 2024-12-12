import dotenv from 'dotenv';
import { Pool } from 'pg';
import { runMigrations, rollbackMigration } from '../src/database/migrations/runner';
import { logger } from '../src/utils/logger';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function main() {
  const command = process.argv[2];

  try {
    if (command === 'rollback') {
      await rollbackMigration(pool);
    } else {
      await runMigrations(pool);
    }
    process.exit(0);
  } catch (error) {
    logger.error('Migration script failed:', error);
    process.exit(1);
  }
}

main();

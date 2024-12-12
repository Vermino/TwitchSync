import { Pool } from 'pg';
import { logger } from '../src/utils/logger';  // Updated path
import * as initialSchema from './001_initial_schema';
import * as downloadTables from './002_download_tables';
import * as vodFileHandling from './003_vod_file_handling';

const migrations = [
  { name: '001_initial_schema', up: initialSchema.up, down: initialSchema.down },
  { name: '002_download_tables', up: downloadTables.up, down: downloadTables.down },
  { name: '003_vod_file_handling', up: vodFileHandling.up, down: vodFileHandling.down }
];

export async function runMigrations(pool: Pool): Promise<void> {
  try {
    // Create migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get executed migrations
    const result = await pool.query(
      'SELECT name FROM migrations ORDER BY id'
    );
    const executedMigrations = new Set(result.rows.map(row => row.name));

    // Run pending migrations
    for (const migration of migrations) {
      if (!executedMigrations.has(migration.name)) {
        logger.info(`Running migration: ${migration.name}`);
        await migration.up(pool);

        // Record migration
        await pool.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migration.name]
        );

        logger.info(`Completed migration: ${migration.name}`);
      } else {
        logger.info(`Migration ${migration.name} already applied`);
      }
    }
  } catch (error) {
    logger.error('Migration runner failed:', error);
    throw error;
  }
}

export async function rollbackMigration(pool: Pool): Promise<void> {
  try {
    // Get last executed migration
    const result = await pool.query(
      'SELECT name FROM migrations ORDER BY id DESC LIMIT 1'
    );

    if (result.rows.length === 0) {
      logger.info('No migrations to rollback');
      return;
    }

    const lastMigration = result.rows[0].name;
    const migration = migrations.find(m => m.name === lastMigration);

    if (migration) {
      logger.info(`Rolling back migration: ${lastMigration}`);
      await migration.down(pool);

      // Remove migration record
      await pool.query(
        'DELETE FROM migrations WHERE name = $1',
        [lastMigration]
      );

      logger.info(`Rolled back migration: ${lastMigration}`);
    }
  } catch (error) {
    logger.error('Migration rollback failed:', error);
    throw error;
  }
}

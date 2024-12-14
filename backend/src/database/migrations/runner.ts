// backend/src/database/migrations/runner.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import * as core from './001_core_tables';
import * as auth from './002_auth_tables';
import * as tasks from './003_task_tables';
import * as discovery from './004_discovery_tables';
import * as metrics from './005_metrics_tables';

interface Migration {
  name: string;
  up: (pool: Pool) => Promise<void>;
  down: (pool: Pool) => Promise<void>;
}

const migrations: Migration[] = [
  { name: '001_core_tables', ...core },
  { name: '002_auth_tables', ...auth },
  { name: '003_task_tables', ...tasks },
  { name: '004_discovery_tables', ...discovery },
  { name: '005_metrics_tables', ...metrics }
];

// Main migration function
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
    const result = await pool.query('SELECT name FROM migrations ORDER BY id');
    const executedMigrations = new Set(result.rows.map(row => row.name));

    // Run pending migrations
    for (const migration of migrations) {
      if (!executedMigrations.has(migration.name)) {
        logger.info(`Running migration: ${migration.name}`);
        await migration.up(pool);
        await pool.query('INSERT INTO migrations (name) VALUES ($1)', [migration.name]);
        logger.info(`Completed migration: ${migration.name}`);
      } else {
        logger.info(`Skipping already executed migration: ${migration.name}`);
      }
    }
  } catch (error) {
    logger.error('Migration runner failed:', error);
    throw error;
  }
}

// Rollback function
export async function rollbackLatest(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get the last executed migration
    const result = await client.query(`
      SELECT name FROM migrations 
      ORDER BY id DESC 
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      logger.info('No migrations to rollback');
      return;
    }

    const lastMigration = result.rows[0].name;
    const migration = migrations.find(m => m.name === lastMigration);

    if (migration) {
      logger.info(`Rolling back migration: ${lastMigration}`);
      await migration.down(pool);
      await client.query('DELETE FROM migrations WHERE name = $1', [lastMigration]);
      logger.info(`Successfully rolled back migration: ${lastMigration}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Migration rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export default {
  runMigrations,
  rollbackLatest
};

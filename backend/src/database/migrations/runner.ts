// backend/src/database/migrations/runner.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

import * as core from './001_core_tables';
import * as auth from './002_auth_tables';
import * as system from './003_system_tables';
import * as vod from './004_vod_tables';
import * as discovery from './005_discovery_tables';

interface Migration {
  name: string;
  up: (pool: Pool) => Promise<void>;
  down: (pool: Pool) => Promise<void>;
}

const migrations: Migration[] = [
  { name: '001_core_tables', ...core },
  { name: '002_auth_tables', ...auth },
  { name: '003_system_tables', ...system },
  { name: '004_vod_tables', ...vod },
  { name: '005_discovery_tables', ...discovery }
];

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT,
        duration_ms INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_migrations_name ON migrations(name);
    `);

    // Get executed migrations
    const result = await client.query('SELECT name FROM migrations ORDER BY id');
    const executedMigrations = new Set(result.rows.map(row => row.name));

    // Run pending migrations
    for (const migration of migrations) {
      if (!executedMigrations.has(migration.name)) {
        logger.info(`Running migration: ${migration.name}`);
        const startTime = Date.now();

        try {
          await migration.up(pool);
          const duration = Date.now() - startTime;

          await client.query(
            'INSERT INTO migrations (name, duration_ms) VALUES ($1, $2)',
            [migration.name, duration]
          );

          logger.info(`Completed migration: ${migration.name} in ${duration}ms`);
        } catch (error) {
          logger.error(`Migration ${migration.name} failed:`, error);
          throw error;
        }
      } else {
        logger.info(`Skipping already executed migration: ${migration.name}`);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Migration runner failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function rollbackLatest(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get the last executed migration
    const result = await client.query(`
      SELECT name, executed_at 
      FROM migrations 
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
      const startTime = Date.now();

      try {
        await migration.down(pool);
        const duration = Date.now() - startTime;

        await client.query(
          'DELETE FROM migrations WHERE name = $1',
          [lastMigration]
        );

        logger.info(`Successfully rolled back migration: ${lastMigration} in ${duration}ms`);
      } catch (error) {
        logger.error(`Rollback of ${lastMigration} failed:`, error);
        throw error;
      }
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

export async function rollbackAll(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get all migrations in reverse order
    const result = await client.query(`
      SELECT name 
      FROM migrations 
      ORDER BY id DESC
    `);

    for (const row of result.rows) {
      const migration = migrations.find(m => m.name === row.name);
      if (migration) {
        logger.info(`Rolling back migration: ${row.name}`);
        const startTime = Date.now();

        try {
          await migration.down(pool);
          await client.query(
            'DELETE FROM migrations WHERE name = $1',
            [row.name]
          );

          const duration = Date.now() - startTime;
          logger.info(`Successfully rolled back migration: ${row.name} in ${duration}ms`);
        } catch (error) {
          logger.error(`Rollback of ${row.name} failed:`, error);
          throw error;
        }
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Complete rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export default {
  runMigrations,
  rollbackLatest,
  rollbackAll
};

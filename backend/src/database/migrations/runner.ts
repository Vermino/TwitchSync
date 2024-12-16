// Filepath: backend/src/database/migrations/runner.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import fs from 'fs';
import path from 'path';

interface Migration {
  id: string;
  name: string;
  executed_at: Date;
}

export async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [tableName]);
    return result.rows[0].exists;
  } finally {
    client.release();
  }
}

export async function forceDropAllTables(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Disable triggers
    await client.query('SET session_replication_role = replica;');

    // Drop custom enum types
    const enumTypesResult = await client.query(`
      SELECT t.typname as enum_name
      FROM pg_type t
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typtype = 'e'
      AND n.nspname = 'public';
    `);

    for (const row of enumTypesResult.rows) {
      await client.query(`DROP TYPE IF EXISTS "${row.enum_name}" CASCADE`);
    }

    // Get all tables
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename != 'migrations'
    `);

    // Drop each table
    for (const row of result.rows) {
      await client.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`);
    }

    // Re-enable triggers
    await client.query('SET session_replication_role = DEFAULT;');

    await client.query('COMMIT');
    logger.info('Successfully dropped all tables and enum types');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error dropping tables and types:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function setupMigrationsTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } finally {
    client.release();
  }
}

export async function getExecutedMigrations(pool: Pool): Promise<string[]> {
  if (!await tableExists(pool, 'migrations')) {
    return [];
  }

  const client = await pool.connect();
  try {
    const result = await client.query<Migration>('SELECT name FROM migrations ORDER BY id ASC');
    return result.rows.map(row => row.name);
  } finally {
    client.release();
  }
}

export async function recordMigration(pool: Pool, migrationName: string): Promise<void> {
  await setupMigrationsTable(pool);
  const client = await pool.connect();
  try {
    await client.query('INSERT INTO migrations (name) VALUES ($1)', [migrationName]);
  } finally {
    client.release();
  }
}

export async function removeMigration(pool: Pool, migrationName: string): Promise<void> {
  if (!await tableExists(pool, 'migrations')) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('DELETE FROM migrations WHERE name = $1', [migrationName]);
  } finally {
    client.release();
  }
}

export async function runMigrations(pool: Pool): Promise<void> {
  await setupMigrationsTable(pool);
  const executedMigrations = await getExecutedMigrations(pool);

  const migrationsDir = path.join(__dirname);
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.ts') && !file.endsWith('runner.ts'))
    .sort();

  for (const file of migrationFiles) {
    if (executedMigrations.includes(file)) {
      logger.info(`Skipping already executed migration: ${file}`);
      continue;
    }

    try {
      const migration = await import(path.join(migrationsDir, file));
      logger.info(`Running migration: ${file}`);
      await migration.up(pool);
      await recordMigration(pool, file);
      logger.info(`Successfully executed migration: ${file}`);
    } catch (error) {
      logger.error(`Migration ${file} failed:`, error);
      throw error;
    }
  }
}

export async function rollbackAllMigrations(pool: Pool, force: boolean = false): Promise<void> {
  if (force) {
    logger.info('Force dropping all tables...');
    await forceDropAllTables(pool);
    if (await tableExists(pool, 'migrations')) {
      const client = await pool.connect();
      try {
        await client.query('DROP TABLE migrations');
      } finally {
        client.release();
      }
    }
    return;
  }

  const executedMigrations = await getExecutedMigrations(pool);
  logger.info(`Found ${executedMigrations.length} migrations to roll back`);

  // Rollback in reverse order
  for (const migration of executedMigrations.reverse()) {
    try {
      const migrationModule = await import(path.join(__dirname, migration));
      logger.info(`Rolling back migration: ${migration}`);
      await migrationModule.down(pool);
      await removeMigration(pool, migration);
      logger.info(`Successfully rolled back migration: ${migration}`);
    } catch (error) {
      logger.error(`Rollback of ${migration} failed:`, error);
      throw error;
    }
  }
}

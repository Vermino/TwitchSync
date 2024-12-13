import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import * as initialSchema from './001_initial_schema';
import * as downloadTables from './002_download_tables';
import * as vodFileHandling from './003_vod_file_handling';
import * as vodSegments from './004_vod_segments';
import * as syncHistory from './005_sync_history';
import * as downloadProgress from './006_download_progress';
import * as settingTable from './007_settings_table';
import * as authTable from './008_auth_tables';
import * as createUsersTable from './009_create_users_table';
import * as updateUsersTable from './010_update_users_table';
import * as ensureUsersTable from './011_ensure_users_table';
import * as updateChannelsMetadata from './012_update_channels_metadata';
import * as createTasksTables from './013_create_tasks_tables';

const migrations = [
  { name: '001_initial_schema', up: initialSchema.up, down: initialSchema.down },
  { name: '002_download_tables', up: downloadTables.up, down: downloadTables.down },
  { name: '003_vod_file_handling', up: vodFileHandling.up, down: vodFileHandling.down },
  { name: '004_vod_segments', up: vodSegments.up, down: vodSegments.down },
  { name: '005_sync_history', up: syncHistory.up, down: syncHistory.down },
  { name: '006_download_progress', up: downloadProgress.up, down: downloadProgress.down },
  { name: '007_settings_table', up: settingTable.up, down: settingTable.down },
  { name: '008_auth_tables', up: authTable.up, down: authTable.down },
  { name: '009_create_users_table', up: createUsersTable.up, down: createUsersTable.down },
  { name: '010_update_users_table', up: updateUsersTable.up, down: updateUsersTable.down },
  { name: '011_ensure_users_table', up: ensureUsersTable.up, down: ensureUsersTable.down },
  { name: '012_update_channels_metadata', up: updateChannelsMetadata.up, down: updateChannelsMetadata.down },
  { name: '013_create_tasks_tables', up: createTasksTables.up, down: createTasksTables.down }
];

export async function runMigrations(pool: Pool): Promise<void> {
  try {
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

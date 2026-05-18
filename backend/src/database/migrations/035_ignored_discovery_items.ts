// Filepath: backend/src/database/migrations/035_ignored_discovery_items.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
      CREATE TABLE IF NOT EXISTS ignored_discovery_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('channel', 'game')),
        item_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, item_type, item_id)
      );

      DO $$ BEGIN
        CREATE INDEX IF NOT EXISTS idx_ignored_discovery_user ON ignored_discovery_items(user_id);
        CREATE INDEX IF NOT EXISTS idx_ignored_discovery_type ON ignored_discovery_items(user_id, item_type);
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

        await client.query('COMMIT');
        logger.info('Migration 035: ignored_discovery_items table created successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Migration 035 failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

export async function down(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DROP TABLE IF EXISTS ignored_discovery_items;');
        await client.query('COMMIT');
        logger.info('Migration 035: ignored_discovery_items table dropped');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

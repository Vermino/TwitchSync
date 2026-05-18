import { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
      ALTER TABLE vods
        ADD COLUMN IF NOT EXISTS pause_reason TEXT,
        ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE
    `);

        await client.query('COMMIT');
        console.log('Migration 037: Added pause_reason and paused_at to vods');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function down(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
      ALTER TABLE vods
        DROP COLUMN IF EXISTS pause_reason,
        DROP COLUMN IF EXISTS paused_at
    `);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

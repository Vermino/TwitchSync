import { Pool } from 'pg';

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS genres TEXT[]`);
        await client.query('COMMIT');
        console.log('Migration 038: Added genres column to games table');
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
        await client.query(`ALTER TABLE games DROP COLUMN IF EXISTS genres`);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// backend/src/middleware/withTransaction.ts

import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

export async function withTransaction<T>(
  pool: Pool,
  handler: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

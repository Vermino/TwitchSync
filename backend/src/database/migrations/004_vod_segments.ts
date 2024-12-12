import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS vod_segments (
          id SERIAL PRIMARY KEY,
          vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
          chapter_id INTEGER REFERENCES vod_chapters(id) ON DELETE CASCADE,
          game_id VARCHAR(50),
          file_path VARCHAR(500) NOT NULL,
          start_time INTEGER NOT NULL,
          duration INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_segment_vod
            FOREIGN KEY(vod_id) 
            REFERENCES vods(id)
            ON DELETE CASCADE,
          CONSTRAINT fk_segment_chapter
            FOREIGN KEY(chapter_id) 
            REFERENCES vod_chapters(id)
            ON DELETE CASCADE
        );

        CREATE INDEX idx_vod_segments_vod_id ON vod_segments(vod_id);
        CREATE INDEX idx_vod_segments_game_id ON vod_segments(game_id);
      `);

      await client.query('COMMIT');
      logger.info('VOD segments migration completed successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
}

export async function down(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      await client.query(`
        DROP TABLE IF EXISTS vod_segments;
      `);

      await client.query('COMMIT');
      logger.info('VOD segments rollback completed successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Migration rollback failed:', error);
    throw error;
  }
}

import { Pool } from 'pg';
// @ts-ignore - Types will be resolved at runtime
import { Download, DownloadQueue } from '../../types/database';

export const downloadsQueries = {
  CREATE_TABLES: `
    CREATE TABLE IF NOT EXISTS vod_downloads (
      id SERIAL PRIMARY KEY,
      vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
      download_path VARCHAR(500),
      metadata_path VARCHAR(500),
      download_status VARCHAR(20) NOT NULL,
      started_at TIMESTAMP NOT NULL,
      completed_at TIMESTAMP,
      file_size BIGINT,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS download_queue (
      id SERIAL PRIMARY KEY,
      vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
      chapter_id INTEGER REFERENCES vod_chapters(id),
      priority INTEGER DEFAULT 1,
      status VARCHAR(20) DEFAULT 'pending',
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_vod_downloads_status ON vod_downloads(download_status);
    CREATE INDEX IF NOT EXISTS idx_vod_downloads_vod_id ON vod_downloads(vod_id);
    CREATE INDEX IF NOT EXISTS idx_download_queue_status ON download_queue(status);
    CREATE INDEX IF NOT EXISTS idx_download_queue_vod_id ON download_queue(vod_id);
  `,

  // Download Queue Queries
  getQueuedDownloads: async (pool: Pool, limit: number): Promise<DownloadQueue[]> => {
    const result = await pool.query<DownloadQueue>(
      `SELECT * FROM download_queue 
       WHERE status = 'pending' 
       ORDER BY priority DESC, created_at ASC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  addToQueue: async (pool: Pool, data: Omit<DownloadQueue, 'id' | 'created_at'>): Promise<DownloadQueue> => {
    const result = await pool.query<DownloadQueue>(
      `INSERT INTO download_queue (
        vod_id, chapter_id, priority, status
      ) VALUES ($1, $2, $3, $4) 
      RETURNING *`,
      [data.vod_id, data.chapter_id, data.priority, data.status]
    );
    return result.rows[0];
  },

  updateQueueStatus: async (pool: Pool, id: number, status: string, error?: string): Promise<void> => {
    await pool.query(
      `UPDATE download_queue 
       SET status = $2, error_message = $3 
       WHERE id = $1`,
      [id, status, error]
    );
  },

  // Downloads Queries
  createDownload: async (pool: Pool, data: Omit<Download, 'id' | 'created_at'>): Promise<Download> => {
    const result = await pool.query<Download>(
      `INSERT INTO vod_downloads (
        vod_id, download_path, metadata_path, download_status,
        started_at, completed_at, file_size, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING *`,
      [
        data.vod_id, data.download_path, data.metadata_path,
        data.download_status, data.started_at, data.completed_at,
        data.file_size, data.error_message
      ]
    );
    return result.rows[0];
  },

  getDownloads: async (pool: Pool): Promise<Download[]> => {
    const result = await pool.query<Download>(
      'SELECT * FROM vod_downloads ORDER BY created_at DESC'
    );
    return result.rows;
  },

  getDownloadById: async (pool: Pool, id: number): Promise<Download | null> => {
    const result = await pool.query<Download>(
      'SELECT * FROM vod_downloads WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  updateDownload: async (pool: Pool, id: number, data: Partial<Download>): Promise<Download | null> => {
    const setClause = Object.keys(data)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(data);
    const result = await pool.query<Download>(
      `UPDATE vod_downloads SET ${setClause} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return result.rows[0] || null;
  },

  getQueueStatus: async (pool: Pool): Promise<{
    pending: number;
    downloading: number;
    failed: number;
  }> => {
    const result = await pool.query(`
      SELECT 
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'downloading' THEN 1 END) as downloading,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM download_queue
    `);

    return {
      pending: parseInt(result.rows[0].pending) || 0,
      downloading: parseInt(result.rows[0].downloading) || 0,
      failed: parseInt(result.rows[0].failed) || 0
    };
  },

  cleanupQueue: async (pool: Pool, maxAge: number): Promise<void> => {
    await pool.query(
      `DELETE FROM download_queue 
       WHERE status = 'completed' 
       AND created_at < NOW() - interval '1 hour' * $1`,
      [maxAge]
    );
  }
};

// Force run lifecycle migration functions
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'twitchsync',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

async function runLifecycleMigration() {
  const client = await pool.connect();
  try {
    console.log('Force running lifecycle migration...');

    // Import and run the lifecycle migration directly
    const migrationPath = path.join(__dirname, 'src/database/migrations/034_vod_lifecycle_management.ts');
    
    // Since it's TypeScript, we'll manually execute the key SQL commands
    await client.query('BEGIN');

    console.log('Creating advisory lock functions...');
    await client.query(`
      CREATE OR REPLACE FUNCTION acquire_vod_lock(vod_twitch_id BIGINT, task_id_val INTEGER)
      RETURNS BOOLEAN AS $$
      DECLARE
        lock_key BIGINT;
      BEGIN
        lock_key := (vod_twitch_id % 2147483647) * 1000000 + (task_id_val % 1000000);
        RETURN pg_try_advisory_lock(lock_key);
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION release_vod_lock(vod_twitch_id BIGINT, task_id_val INTEGER)
      RETURNS BOOLEAN AS $$
      DECLARE
        lock_key BIGINT;
      BEGIN
        lock_key := (vod_twitch_id % 2147483647) * 1000000 + (task_id_val % 1000000);
        RETURN pg_advisory_unlock(lock_key);
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('Creating cleanup function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_vod_locks()
      RETURNS INTEGER AS $$
      DECLARE
        cleaned_count INTEGER;
      BEGIN
        UPDATE vod_file_states SET
          operation_status = 'failed',
          processing_locked_by = NULL,
          lock_timeout_at = NULL,
          error_details = jsonb_build_object(
            'error', 'Lock timeout - worker may have crashed',
            'expired_at', NOW()
          ),
          retry_count = retry_count + 1,
          updated_at = NOW()
        WHERE lock_timeout_at < NOW() 
          AND processing_locked_by IS NOT NULL;
        
        GET DIAGNOSTICS cleaned_count = ROW_COUNT;
        RETURN cleaned_count;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('Creating safe cleanup function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION safe_cleanup_orphaned_vods()
      RETURNS TABLE (
        cleaned_vod_states INTEGER,
        cleaned_completed_vods INTEGER,
        cleaned_retention_tracking INTEGER
      ) AS $$
      DECLARE
        vod_states_count INTEGER;
        completed_vods_count INTEGER;
        retention_count INTEGER;
      BEGIN
        -- Clean up vod_file_states where referenced vod or task no longer exists
        DELETE FROM vod_file_states vfs
        WHERE NOT EXISTS (SELECT 1 FROM vods v WHERE v.id = vfs.vod_id)
           OR NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = vfs.task_id);
        GET DIAGNOSTICS vod_states_count = ROW_COUNT;

        -- Clean up completed_vods where referenced vod or task no longer exists  
        DELETE FROM completed_vods cv
        WHERE NOT EXISTS (SELECT 1 FROM vods v WHERE v.id = cv.vod_id)
           OR NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = cv.task_id);
        GET DIAGNOSTICS completed_vods_count = ROW_COUNT;

        -- Clean up retention tracking for non-existent VODs
        DELETE FROM vod_retention_tracking vrt
        WHERE NOT EXISTS (SELECT 1 FROM vods v WHERE v.id = vrt.vod_id);
        GET DIAGNOSTICS retention_count = ROW_COUNT;

        -- Return cleanup stats
        cleaned_vod_states := vod_states_count;
        cleaned_completed_vods := completed_vods_count;
        cleaned_retention_tracking := retention_count;
        
        RETURN NEXT;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('Creating safe upsert function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION upsert_completed_vod(
        p_vod_id INTEGER,
        p_task_id INTEGER, 
        p_twitch_id BIGINT,
        p_file_path TEXT,
        p_file_name TEXT,
        p_file_size_bytes BIGINT,
        p_download_duration_seconds INTEGER DEFAULT NULL,
        p_download_speed_mbps DECIMAL(10,2) DEFAULT NULL,
        p_checksum_md5 TEXT DEFAULT NULL,
        p_metadata JSONB DEFAULT '{}'::jsonb
      )
      RETURNS INTEGER AS $$
      DECLARE
        completed_vod_id INTEGER;
      BEGIN
        INSERT INTO completed_vods (
          vod_id, task_id, twitch_id, file_path, file_name, file_size_bytes,
          download_duration_seconds, download_speed_mbps, checksum_md5, metadata
        ) VALUES (
          p_vod_id, p_task_id, p_twitch_id, p_file_path, p_file_name, p_file_size_bytes,
          p_download_duration_seconds, p_download_speed_mbps, p_checksum_md5, p_metadata
        ) 
        ON CONFLICT (twitch_id, task_id) DO UPDATE SET
          file_path = EXCLUDED.file_path,
          file_name = EXCLUDED.file_name, 
          file_size_bytes = EXCLUDED.file_size_bytes,
          download_duration_seconds = COALESCE(EXCLUDED.download_duration_seconds, completed_vods.download_duration_seconds),
          download_speed_mbps = COALESCE(EXCLUDED.download_speed_mbps, completed_vods.download_speed_mbps),
          checksum_md5 = COALESCE(EXCLUDED.checksum_md5, completed_vods.checksum_md5),
          metadata = EXCLUDED.metadata,
          completed_at = NOW()
        RETURNING id;
        
        SELECT id INTO completed_vod_id FROM completed_vods 
        WHERE twitch_id = p_twitch_id AND task_id = p_task_id;
        RETURN completed_vod_id;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('Creating is_vod_completed_safe function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION is_vod_completed_safe(
        p_twitch_vod_id BIGINT,
        p_task_id INTEGER
      )
      RETURNS BOOLEAN AS $$
      BEGIN
        RETURN EXISTS (
          SELECT 1 FROM completed_vods cv 
          WHERE cv.twitch_id = p_twitch_vod_id AND cv.task_id = p_task_id
        ) OR EXISTS (
          SELECT 1 FROM vod_file_states vfs 
          WHERE vfs.twitch_vod_id = p_twitch_vod_id 
            AND vfs.task_id = p_task_id 
            AND vfs.operation_status = 'completed'
        );
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query('COMMIT');
    console.log('✅ Lifecycle migration functions created successfully!');

    // Test that functions exist
    const result = await client.query(`
      SELECT proname FROM pg_proc 
      WHERE proname IN ('cleanup_expired_vod_locks', 'safe_cleanup_orphaned_vods', 'upsert_completed_vod', 'is_vod_completed_safe')
    `);
    
    console.log('✅ Created functions:', result.rows.map(r => r.proname));

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error running lifecycle migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration
runLifecycleMigration()
  .then(() => {
    console.log('🎉 Lifecycle migration completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
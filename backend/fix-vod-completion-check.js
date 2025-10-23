// Fix VOD completion check function with fallback logic
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'twitchsync',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function fixVodCompletionCheck() {
  const client = await pool.connect();
  try {
    console.log('Fixing VOD completion check function...');

    await client.query('BEGIN');

    // First, check if vod_file_states table exists and its structure
    console.log('Checking vod_file_states table structure...');
    
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'vod_file_states'
      );
    `);

    if (tableExists.rows[0].exists) {
      console.log('vod_file_states table exists');
      
      // Check column structure
      const columns = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'vod_file_states'
        ORDER BY ordinal_position;
      `);
      
      console.log('vod_file_states columns:', columns.rows);
      
      // Check if twitch_vod_id column exists
      const hasTwitchVodId = columns.rows.some(col => col.column_name === 'twitch_vod_id');
      const hasTwitchId = columns.rows.some(col => col.column_name === 'twitch_id');
      
      console.log(`Has twitch_vod_id: ${hasTwitchVodId}, Has twitch_id: ${hasTwitchId}`);
      
      // Create corrected function based on actual schema
      if (hasTwitchVodId) {
        console.log('Using twitch_vod_id column (correct schema)');
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
      } else if (hasTwitchId) {
        console.log('Using twitch_id column (schema mismatch - fixing)');
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
              WHERE vfs.twitch_id = p_twitch_vod_id 
                AND vfs.task_id = p_task_id 
                AND vfs.operation_status = 'completed'
            );
          END;
          $$ LANGUAGE plpgsql;
        `);
      } else {
        console.log('No suitable twitch id column found - creating fallback');
        await client.query(`
          CREATE OR REPLACE FUNCTION is_vod_completed_safe(
            p_twitch_vod_id BIGINT,
            p_task_id INTEGER
          )
          RETURNS BOOLEAN AS $$
          BEGIN
            -- Fallback: only check completed_vods table
            RETURN EXISTS (
              SELECT 1 FROM completed_vods cv 
              WHERE cv.twitch_id = p_twitch_vod_id AND cv.task_id = p_task_id
            );
          END;
          $$ LANGUAGE plpgsql;
        `);
      }
      
    } else {
      console.log('vod_file_states table does not exist - creating simplified function');
      await client.query(`
        CREATE OR REPLACE FUNCTION is_vod_completed_safe(
          p_twitch_vod_id BIGINT,
          p_task_id INTEGER
        )
        RETURNS BOOLEAN AS $$
        BEGIN
          -- Fallback: only check completed_vods table since vod_file_states doesn't exist
          RETURN EXISTS (
            SELECT 1 FROM completed_vods cv 
            WHERE cv.twitch_id = p_twitch_vod_id AND cv.task_id = p_task_id
          );
        END;
        $$ LANGUAGE plpgsql;
      `);
    }

    await client.query('COMMIT');
    console.log('✅ VOD completion check function fixed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error fixing VOD completion check:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the fix
fixVodCompletionCheck()
  .then(() => {
    console.log('🎉 VOD completion check fix completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Fix failed:', error);
    process.exit(1);
  });
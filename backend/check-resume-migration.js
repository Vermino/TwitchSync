const { Pool } = require('pg');

async function checkMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // Check if last_resumed_at column exists in tasks table
    const tasksResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'tasks' AND column_name = 'last_resumed_at'
    `);
    
    console.log('Tasks table last_resumed_at column:', tasksResult.rows.length > 0 ? 'EXISTS' : 'NOT FOUND');

    // Check if paused status exists in task_status enum
    const taskStatusResult = await pool.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = 'task_status'::regtype AND enumlabel = 'paused'
    `);
    
    console.log('Task status paused enum:', taskStatusResult.rows.length > 0 ? 'EXISTS' : 'NOT FOUND');

    // Check if resume columns exist in vods table
    const vodsResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vods' AND column_name IN ('resume_segment_index', 'pause_reason', 'paused_at')
    `);
    
    console.log('VODs table resume columns:', vodsResult.rows.map(r => r.column_name));

    // Check if paused status exists in vod_status enum
    const vodStatusResult = await pool.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = 'vod_status'::regtype AND enumlabel = 'paused'
    `);
    
    console.log('VOD status paused enum:', vodStatusResult.rows.length > 0 ? 'EXISTS' : 'NOT FOUND');

    // Check if resume functions exist
    const functionResult = await pool.query(`
      SELECT proname 
      FROM pg_proc 
      WHERE proname IN ('get_resumable_tasks_for_user', 'resume_task_downloads')
    `);
    
    console.log('Resume functions:', functionResult.rows.map(r => r.proname));

  } catch (error) {
    console.error('Error checking migration:', error);
  } finally {
    await pool.end();
  }
}

checkMigration();
#!/usr/bin/env node

const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'twitchsync',
  user: 'postgres',
  password: 'password'
});

async function checkVODs() {
  const client = await pool.connect();
  try {
    // Check for VODs created for task 4
    const result = await client.query('SELECT id, twitch_id, title, download_status, task_id, created_at FROM vods WHERE task_id = 4 ORDER BY created_at DESC LIMIT 5');
    console.log('VODs found for task 4:');
    console.log(result.rows.length + ' VODs found');
    if (result.rows.length > 0) {
      result.rows.forEach(vod => {
        console.log(`- VOD ${vod.id}: ${vod.title} (status: ${vod.download_status})`);
      });
    }
    
    // Also check task status
    const taskResult = await client.query('SELECT id, name, status, error_message FROM tasks WHERE id = 4');
    console.log('\nTask 4 current status:');
    console.log(`- Status: ${taskResult.rows[0].status}`);
    console.log(`- Error: ${taskResult.rows[0].error_message || 'None'}`);
    
    // Check monitoring
    const monitoringResult = await client.query('SELECT status, status_message, progress_percentage FROM task_monitoring WHERE task_id = 4');
    console.log('\nTask 4 monitoring:');
    if (monitoringResult.rows.length > 0) {
      const mon = monitoringResult.rows[0];
      console.log(`- Status: ${mon.status}`);
      console.log(`- Message: ${mon.status_message}`);
      console.log(`- Progress: ${mon.progress_percentage}%`);
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkVODs().catch(console.error);
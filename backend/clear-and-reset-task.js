// Clear existing VOD downloads and reset task for testing
const { Pool } = require('pg');

async function clearAndResetTask() {
  const pool = new Pool({
    user: 'postgres',
    password: 'password',
    host: 'localhost',
    port: 5432,
    database: 'twitchsync'
  });

  try {
    console.log('1. Finding Celerity + Backpack Battles task...');
    const taskResult = await pool.query(`
      SELECT t.id, t.name
      FROM tasks t
      JOIN channels c ON c.id = ANY(t.channel_ids)
      JOIN games g ON g.id = ANY(t.game_ids)  
      WHERE t.is_active = true 
        AND c.username = 'celerity'
        AND g.name = 'Backpack Battles'
      ORDER BY t.id DESC
      LIMIT 1
    `);
    
    if (taskResult.rows.length === 0) {
      console.log('No active Celerity + Backpack Battles task found');
      return;
    }
    
    const taskId = taskResult.rows[0].id;
    console.log(`Found task ${taskId}: ${taskResult.rows[0].name}`);
    
    console.log('2. Clearing existing VOD downloads for this task...');
    const deleteResult = await pool.query(`
      DELETE FROM vods WHERE task_id = $1
    `, [taskId]);
    
    console.log(`Deleted ${deleteResult.rowCount} existing VOD records`);
    
    console.log('3. Resetting task status...');
    await pool.query(`
      UPDATE tasks 
      SET status = 'pending'::task_status,
          next_run = NOW() - INTERVAL '1 minute',
          updated_at = NOW()
      WHERE id = $1
    `, [taskId]);
    
    await pool.query(`
      UPDATE task_monitoring
      SET status = 'pending',
          status_message = 'Task reset for testing improved filtering',
          items_total = 0,
          items_completed = 0,
          progress_percentage = 0,
          updated_at = NOW()
      WHERE task_id = $1
    `, [taskId]);
    
    console.log(`✅ Task ${taskId} cleared and reset for testing`);
    console.log('The task scheduler should pick it up within 60 seconds with the new title-based filtering');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

clearAndResetTask().catch(console.error);
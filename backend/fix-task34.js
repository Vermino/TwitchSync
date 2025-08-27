// Fix task 34 - reset it to trigger execution
const { Pool } = require('pg');

async function fixTask34() {
  const pool = new Pool({
    user: 'postgres',
    password: 'password',
    host: 'localhost',
    port: 5432,
    database: 'twitchsync'
  });

  try {
    console.log('Checking task 34 status...');
    
    const taskResult = await pool.query(`
      SELECT t.id, t.name, t.status, t.channel_ids, t.game_ids, t.next_run, t.last_run,
             array_agg(DISTINCT c.username) as channels,
             array_agg(DISTINCT g.name) as games
      FROM tasks t
      LEFT JOIN channels c ON c.id = ANY(t.channel_ids)
      LEFT JOIN games g ON g.id = ANY(t.game_ids)
      WHERE t.id = 34
      GROUP BY t.id, t.name, t.status, t.channel_ids, t.game_ids, t.next_run, t.last_run
    `);
    
    if (taskResult.rows.length === 0) {
      console.log('Task 34 not found');
      return;
    }
    
    const task = taskResult.rows[0];
    console.log('Task 34 status:', task);
    
    // Check if channel_ids and game_ids are correct
    if (task.channel_ids && task.channel_ids.includes(7) && task.game_ids && task.game_ids.includes(7)) {
      console.log('✅ Task has correct channel_ids and game_ids');
      console.log('  Channels:', task.channels);
      console.log('  Games:', task.games);
      
      // Reset task to trigger execution
      console.log('Resetting task to trigger execution...');
      await pool.query(`
        UPDATE tasks 
        SET status = 'pending'::task_status,
            next_run = NOW() - INTERVAL '1 minute',
            updated_at = NOW()
        WHERE id = 34
      `);
      
      await pool.query(`
        UPDATE task_monitoring
        SET status = 'pending',
            status_message = 'Task reset - ready for execution with proper channel data',
            updated_at = NOW()
        WHERE task_id = 34
      `);
      
      console.log('✅ Task 34 reset successfully');
      console.log('The task scheduler should pick it up within 60 seconds');
      
    } else {
      console.log('❌ Task missing channel or game data');
      console.log('  channel_ids:', task.channel_ids);
      console.log('  game_ids:', task.game_ids);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

fixTask34().catch(console.error);
// Clear all incorrectly queued VODs that don't match Backpack Battles
const { Pool } = require('pg');

async function clearIncorrectVODs() {
  const pool = new Pool({
    user: 'postgres',
    password: 'password',
    host: 'localhost',
    port: 5432,
    database: 'twitchsync'
  });

  try {
    console.log('Clearing all incorrectly queued VODs for Celerity + Backpack Battles tasks...');
    
    const deleteResult = await pool.query(`
      DELETE FROM vods v
      USING tasks t, channels c, games g
      WHERE v.task_id = t.id
        AND c.id = ANY(t.channel_ids)
        AND g.id = ANY(t.game_ids)
        AND t.is_active = true 
        AND c.username = 'celerity'
        AND g.name = 'Backpack Battles'
    `);
    
    console.log(`✅ Deleted ${deleteResult.rowCount} incorrectly queued VODs`);
    
    // Reset task monitoring
    console.log('Resetting task monitoring status...');
    await pool.query(`
      UPDATE task_monitoring tm
      SET status = 'pending',
          status_message = 'Task reset - backend restarted with improved filtering',
          items_total = 0,
          items_completed = 0,
          progress_percentage = 0,
          updated_at = NOW()
      FROM tasks t, channels c, games g
      WHERE tm.task_id = t.id
        AND c.id = ANY(t.channel_ids)
        AND g.id = ANY(t.game_ids)
        AND t.is_active = true 
        AND c.username = 'celerity'
        AND g.name = 'Backpack Battles'
    `);
    
    // Reset task status
    console.log('Resetting task status...');
    await pool.query(`
      UPDATE tasks t
      SET status = 'pending'::task_status,
          next_run = NOW() - INTERVAL '1 minute',
          updated_at = NOW()
      FROM channels c, games g
      WHERE c.id = ANY(t.channel_ids)
        AND g.id = ANY(t.game_ids)
        AND t.is_active = true 
        AND c.username = 'celerity'
        AND g.name = 'Backpack Battles'
    `);
    
    console.log('✅ All Celerity + Backpack Battles tasks reset');
    console.log('Now restart the backend and the task will re-run with improved filtering');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

clearIncorrectVODs().catch(console.error);
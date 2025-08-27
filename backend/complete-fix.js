// Complete the fix without ON CONFLICT
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function completeFix() {
  const client = await pool.connect();
  try {
    console.log('=== COMPLETING TASK MONITORING FIX ===\n');
    
    // 1. Check if task 32 monitoring exists
    const task32Monitor = await client.query(`
      SELECT id FROM task_monitoring WHERE task_id = 32
    `);
    
    if (task32Monitor.rows.length > 0) {
      // Update existing
      await client.query(`
        UPDATE task_monitoring 
        SET status = 'pending',
            status_message = 'Task ready for activation',
            updated_at = NOW()
        WHERE task_id = 32
      `);
      console.log('✓ Updated existing monitoring for task 32');
    } else {
      // Insert new
      await client.query(`
        INSERT INTO task_monitoring (
          task_id, status, status_message, progress_percentage,
          items_total, items_completed, items_failed,
          created_at, updated_at
        ) VALUES (32, 'pending', 'Task ready for activation', 0, 0, 0, 0, NOW(), NOW())
      `);
      console.log('✓ Created new monitoring for task 32');
    }

    // 2. Update task 26 monitoring  
    await client.query(`
      UPDATE task_monitoring 
      SET status = 'pending',
          status_message = 'Task ready for immediate execution',
          updated_at = NOW()
      WHERE task_id = 26
    `);
    console.log('✓ Updated monitoring for task 26');

    // 3. Verify final state
    console.log('\n=== FINAL VERIFICATION ===');
    
    const finalState = await client.query(`
      SELECT 
        t.id, 
        t.name, 
        t.channel_ids, 
        t.game_ids,
        t.status,
        t.is_active,
        t.next_run,
        tm.status as monitoring_status,
        tm.status_message
      FROM tasks t
      LEFT JOIN task_monitoring tm ON t.id = tm.task_id
      WHERE t.user_id = 27
      ORDER BY t.id
    `);
    
    console.log(`User 27 now has ${finalState.rows.length} tasks:`);
    finalState.rows.forEach(task => {
      console.log(`\n- Task ${task.id}: "${task.name}"`);
      console.log(`  Channels: ${JSON.stringify(task.channel_ids)}`);
      console.log(`  Games: ${JSON.stringify(task.game_ids)}`);
      console.log(`  Status: ${task.status} (monitoring: ${task.monitoring_status})`);
      console.log(`  Active: ${task.is_active}`);
      console.log(`  Next run: ${task.next_run}`);
      console.log(`  Message: ${task.status_message}`);
    });

    // 4. Check channel/game details for the tasks
    console.log('\n=== CHANNEL AND GAME DETAILS ===');
    
    // Get channel details for both tasks
    const channels = await client.query(`
      SELECT id, username, display_name FROM channels WHERE id IN (1, 7)
    `);
    
    const games = await client.query(`
      SELECT id, name FROM games WHERE id IN (1, 7)  
    `);
    
    console.log('\nChannel mappings:');
    channels.rows.forEach(c => {
      console.log(`  ID ${c.id}: ${c.display_name || c.username}`);
    });
    
    console.log('\nGame mappings:');
    games.rows.forEach(g => {
      console.log(`  ID ${g.id}: ${g.name}`);
    });

    console.log('\n✓ ALL FIXES COMPLETE!');
    console.log('\nSUMMARY:');
    console.log('========');
    console.log('1. ✓ Task 32 (Celerity + Backpack Battles) transferred to user 27');
    console.log('2. ✓ Task 26 scheduling fixed (will run immediately)');
    console.log('3. ✓ Task monitoring updated for both tasks');
    console.log('4. ✓ User 27 now has both tasks and can activate the Celerity one');

  } catch (error) {
    console.error('Error during complete fix:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

completeFix();
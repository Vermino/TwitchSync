// Comprehensive fix for user task and scheduling issues
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function fixUserTaskIssues() {
  const client = await pool.connect();
  try {
    console.log('=== FIXING USER TASK AND SCHEDULING ISSUES ===\n');
    
    // 1. Fix the user ownership issue - Transfer task 32 from user 3 to user 27
    console.log('1. FIXING TASK OWNERSHIP:');
    console.log('=========================');
    
    const taskTransferResult = await client.query(`
      UPDATE tasks 
      SET user_id = 27, 
          updated_at = NOW()
      WHERE id = 32 AND user_id = 3
      RETURNING id, name, user_id, channel_ids, game_ids
    `);
    
    if (taskTransferResult.rows.length > 0) {
      const task = taskTransferResult.rows[0];
      console.log(`✓ Transferred task ${task.id} "${task.name}" from user 3 to user 27`);
      console.log(`  - Channels: ${JSON.stringify(task.channel_ids)}`);
      console.log(`  - Games: ${JSON.stringify(task.game_ids)}`);
    } else {
      console.log('✗ Task 32 not found or already owned by user 27');
    }

    // 2. Fix task 26 scheduling - reset its next_run to immediate execution
    console.log('\n2. FIXING OVERDUE TASK SCHEDULING:');
    console.log('==================================');
    
    const scheduleFixResult = await client.query(`
      UPDATE tasks 
      SET next_run = NOW() - INTERVAL '1 minute',
          status = 'pending'::task_status,
          updated_at = NOW()
      WHERE id = 26 AND user_id = 27
      RETURNING id, name, next_run, status, is_active
    `);
    
    if (scheduleFixResult.rows.length > 0) {
      const task = scheduleFixResult.rows[0];
      console.log(`✓ Fixed scheduling for task ${task.id} "${task.name}"`);
      console.log(`  - New next_run: ${task.next_run} (immediate)`);
      console.log(`  - Status: ${task.status}, Active: ${task.is_active}`);
    }

    // 3. Update task monitoring for both tasks
    console.log('\n3. UPDATING TASK MONITORING:');
    console.log('============================');
    
    // Fix task 32 monitoring (newly transferred)
    await client.query(`
      INSERT INTO task_monitoring (
        task_id, status, status_message, progress_percentage,
        items_total, items_completed, items_failed,
        created_at, updated_at
      ) VALUES (32, 'pending', 'Task ready for activation', 0, 0, 0, 0, NOW(), NOW())
      ON CONFLICT (task_id) DO UPDATE SET
        status = 'pending',
        status_message = 'Task ready for activation',
        updated_at = NOW()
    `);
    console.log('✓ Updated monitoring for task 32 (Celerity + Backpack Battles)');

    // Fix task 26 monitoring
    await client.query(`
      UPDATE task_monitoring 
      SET status = 'pending',
          status_message = 'Task ready for immediate execution',
          updated_at = NOW()
      WHERE task_id = 26
    `);
    console.log('✓ Updated monitoring for task 26 (Test Task)');

    // 4. Check current task state for user 27
    console.log('\n4. CURRENT TASK STATE FOR USER 27:');
    console.log('===================================');
    
    const userTasksResult = await client.query(`
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
      ORDER BY t.updated_at DESC
    `);
    
    console.log(`Found ${userTasksResult.rows.length} tasks for user 27:`);
    userTasksResult.rows.forEach(task => {
      console.log(`- Task ${task.id}: "${task.name}"`);
      console.log(`  Channels: ${JSON.stringify(task.channel_ids)}, Games: ${JSON.stringify(task.game_ids)}`);
      console.log(`  Status: ${task.status} (${task.monitoring_status})`);
      console.log(`  Active: ${task.is_active}, Next run: ${task.next_run}`);
      console.log(`  Message: ${task.status_message}\n`);
    });

    // 5. Verify channel and game mappings
    console.log('5. VERIFYING CHANNEL AND GAME MAPPINGS:');
    console.log('=======================================');
    
    const channelCheck = await client.query(`
      SELECT id, username, display_name FROM channels WHERE id IN (1, 7)
    `);
    console.log('Channels:');
    channelCheck.rows.forEach(c => {
      console.log(`  - ID ${c.id}: ${c.display_name || c.username}`);
    });

    const gameCheck = await client.query(`
      SELECT id, name FROM games WHERE id IN (1, 7)
    `);
    console.log('Games:');
    gameCheck.rows.forEach(g => {
      console.log(`  - ID ${g.id}: ${g.name}`);
    });

    console.log('\n=== FIX COMPLETE ===');
    console.log('User 27 should now see:');
    console.log('1. Task 26: Test Task (channels:[1], games:[1]) - will run immediately');
    console.log('2. Task 32: Celerity + Backpack Battles (channels:[7], games:[7]) - ready to activate');

  } catch (error) {
    console.error('Error during fix:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixUserTaskIssues();
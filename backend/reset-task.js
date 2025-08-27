/**
 * Task Reset Script
 * 
 * This script resets a stuck task in the database by:
 * 1. Finding the latest task (highest ID)
 * 2. Resetting its status to 'pending'
 * 3. Setting next_run to NOW() for immediate execution
 * 4. Clearing any locked monitoring records
 */

const { Pool } = require('pg');

// Database configuration
const dbConfig = {
  host: 'localhost',
  port: 5432,
  database: 'twitchsync',
  user: 'postgres',
  password: 'postgres',
  ssl: false
};

async function resetStuckTask() {
  const pool = new Pool(dbConfig);
  let client;

  try {
    // Connect to database
    console.log('Connecting to database...');
    client = await pool.connect();
    console.log('✓ Database connection established');

    // Start transaction
    await client.query('BEGIN');
    console.log('✓ Transaction started');

    // Find the latest task
    console.log('\nFinding latest task...');
    const latestTaskResult = await client.query(`
      SELECT id, name, status, next_run, last_run
      FROM tasks 
      ORDER BY id DESC 
      LIMIT 1
    `);

    if (latestTaskResult.rows.length === 0) {
      console.log('❌ No tasks found in database');
      await client.query('ROLLBACK');
      return;
    }

    const task = latestTaskResult.rows[0];
    console.log(`✓ Found task: ID=${task.id}, Name="${task.name}", Status="${task.status}"`);
    console.log(`  Current next_run: ${task.next_run}`);
    console.log(`  Last run: ${task.last_run || 'Never'}`);

    // Reset task status and schedule
    console.log('\nResetting task status...');
    const updateResult = await client.query(`
      UPDATE tasks 
      SET 
        status = 'pending',
        next_run = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, status, next_run
    `, [task.id]);

    if (updateResult.rows.length > 0) {
      const updatedTask = updateResult.rows[0];
      console.log(`✓ Task ${updatedTask.id} status reset to '${updatedTask.status}'`);
      console.log(`✓ Next run scheduled for: ${updatedTask.next_run}`);
    } else {
      console.log('❌ Failed to update task');
      await client.query('ROLLBACK');
      return;
    }

    // Clear any locked monitoring records
    console.log('\nClearing monitoring locks...');
    
    // Check if task_monitoring table exists and has records for this task
    const monitoringCheckResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'task_monitoring'
      )
    `);

    if (monitoringCheckResult.rows[0].exists) {
      const monitoringResult = await client.query(`
        SELECT id, status 
        FROM task_monitoring 
        WHERE task_id = $1
      `, [task.id]);

      if (monitoringResult.rows.length > 0) {
        const monitoring = monitoringResult.rows[0];
        console.log(`  Found monitoring record: ID=${monitoring.id}, Status="${monitoring.status}"`);
        
        // Reset monitoring status to match task status
        await client.query(`
          UPDATE task_monitoring 
          SET 
            status = 'pending',
            progress_percentage = 0,
            items_completed = 0,
            items_failed = 0,
            updated_at = NOW()
          WHERE task_id = $1
        `, [task.id]);
        
        console.log('✓ Monitoring record reset to pending state');
      } else {
        console.log('  No monitoring record found for this task');
      }
    } else {
      console.log('  task_monitoring table does not exist');
    }

    // Clear any task history entries that might be causing issues
    console.log('\nChecking task history...');
    const historyResult = await client.query(`
      SELECT COUNT(*) as count
      FROM task_history 
      WHERE task_id = $1 AND status = 'running'
    `, [task.id]);

    const runningHistoryCount = parseInt(historyResult.rows[0].count);
    if (runningHistoryCount > 0) {
      console.log(`  Found ${runningHistoryCount} running history entries`);
      
      // Update running entries to failed with end time
      await client.query(`
        UPDATE task_history 
        SET 
          status = 'failed',
          end_time = NOW(),
          error_message = 'Task reset by admin script'
        WHERE task_id = $1 AND status = 'running' AND end_time IS NULL
      `, [task.id]);
      
      console.log('✓ Running history entries marked as failed');
    } else {
      console.log('  No running history entries found');
    }

    // Commit transaction
    await client.query('COMMIT');
    console.log('\n✓ All changes committed successfully');

    // Final verification
    console.log('\nFinal verification...');
    const verificationResult = await client.query(`
      SELECT id, name, status, next_run
      FROM tasks 
      WHERE id = $1
    `, [task.id]);

    if (verificationResult.rows.length > 0) {
      const finalTask = verificationResult.rows[0];
      console.log(`✓ Task ${finalTask.id} ("${finalTask.name}") is now ${finalTask.status}`);
      console.log(`✓ Scheduled to run at: ${finalTask.next_run}`);
      console.log('\n🎉 Task reset completed successfully!');
      console.log('\nThe task scheduler should pick up this task in the next cycle.');
    }

  } catch (error) {
    console.error('\n❌ Error occurred:', error.message);
    
    if (client) {
      try {
        await client.query('ROLLBACK');
        console.log('✓ Transaction rolled back');
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError.message);
      }
    }
    
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
    console.log('✓ Database connection closed');
  }
}

// Handle script execution
if (require.main === module) {
  console.log('='.repeat(60));
  console.log('🔧 TwitchSync Task Reset Script');
  console.log('='.repeat(60));
  
  resetStuckTask().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { resetStuckTask };
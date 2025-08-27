// Test script to verify the VOD progress tracking implementation
// Filepath: backend/test-progress-tracking.js

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'twitchsync',
  user: 'postgres',
  password: 'password'
});

async function testProgressTracking() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Testing VOD Progress Tracking Implementation');
    console.log('='.repeat(50));
    
    // Test 1: Check if completed_vods table exists
    console.log('\n1. Checking completed_vods table...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'completed_vods'
      );
    `);
    
    console.log(`✅ completed_vods table exists: ${tableCheck.rows[0].exists}`);
    
    // Test 2: Check current task progress
    console.log('\n2. Checking task progress calculations...');
    const taskProgress = await client.query(`
      SELECT 
        t.id as task_id,
        t.name,
        t.status,
        t.is_active,
        COALESCE((SELECT COUNT(*) FROM completed_vods cv WHERE cv.task_id = t.id), 0) as completed_vods,
        COALESCE((SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id), 0) as total_vods,
        CASE 
          WHEN (SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id) > 0 THEN
            ROUND((COALESCE((SELECT COUNT(*) FROM completed_vods cv WHERE cv.task_id = t.id), 0)::numeric / 
                   (SELECT COUNT(*) FROM vods v WHERE v.task_id = t.id)::numeric) * 100, 2)
          ELSE 0
        END as completion_percentage,
        tm.status_message,
        tm.progress_percentage as monitoring_progress
      FROM tasks t
      LEFT JOIN task_monitoring tm ON t.id = tm.task_id
      WHERE t.is_active = true
      ORDER BY t.id DESC
      LIMIT 5
    `);
    
    if (taskProgress.rows.length === 0) {
      console.log('⚠️  No active tasks found');
    } else {
      console.log('📊 Active Task Progress:');
      console.log('-'.repeat(30));
      
      taskProgress.rows.forEach(task => {
        console.log(`Task ${task.task_id}: ${task.name}`);
        console.log(`  Status: ${task.status} (${task.is_active ? 'Active' : 'Inactive'})`);
        console.log(`  Progress: ${task.completed_vods}/${task.total_vods} VODs (${task.completion_percentage}%)`);
        console.log(`  Monitor: ${task.status_message}`);
        console.log(`  Monitor %: ${task.monitoring_progress}%`);
        console.log('');
      });
    }
    
    // Test 3: Check if any completed VODs exist
    console.log('\n3. Checking completed VODs...');
    const completedCheck = await client.query(`
      SELECT 
        COUNT(*) as total_completed,
        AVG(file_size_bytes) as avg_file_size,
        AVG(download_duration_seconds) as avg_duration,
        AVG(download_speed_mbps) as avg_speed
      FROM completed_vods
    `);
    
    const completed = completedCheck.rows[0];
    console.log(`📈 Completed VODs Statistics:`);
    console.log(`  Total Completed: ${completed.total_completed}`);
    console.log(`  Avg File Size: ${(completed.avg_file_size / (1024*1024*1024)).toFixed(2)} GB`);
    console.log(`  Avg Duration: ${completed.avg_duration} seconds`);
    console.log(`  Avg Speed: ${completed.avg_speed} Mbps`);
    
    // Test 4: Check recent completions
    if (completed.total_completed > 0) {
      console.log('\n4. Recent completions...');
      const recentCompletions = await client.query(`
        SELECT 
          cv.twitch_id,
          cv.task_id,
          cv.file_name,
          cv.file_size_bytes,
          cv.download_speed_mbps,
          cv.completed_at,
          v.title
        FROM completed_vods cv
        LEFT JOIN vods v ON cv.vod_id = v.id
        ORDER BY cv.completed_at DESC
        LIMIT 3
      `);
      
      console.log('🎯 Recent Completed Downloads:');
      recentCompletions.rows.forEach(vod => {
        console.log(`  ${vod.twitch_id}: ${vod.title || vod.file_name}`);
        console.log(`    Task: ${vod.task_id}, Size: ${(vod.file_size_bytes/(1024*1024)).toFixed(1)}MB`);
        console.log(`    Speed: ${vod.download_speed_mbps}Mbps, Completed: ${vod.completed_at}`);
        console.log('');
      });
    }
    
    // Test 5: Test the helper functions
    console.log('\n5. Testing helper functions...');
    try {
      const functionTest = await client.query(`
        SELECT 
          get_task_completion_stats($1) as stats
      `, [taskProgress.rows[0]?.task_id || 1]);
      
      console.log('✅ get_task_completion_stats function works');
    } catch (err) {
      console.log('❌ get_task_completion_stats function error:', err.message);
    }
    
    try {
      const isCompletedTest = await client.query(`
        SELECT is_vod_completed($1, $2) as is_completed
      `, [123456789, taskProgress.rows[0]?.task_id || 1]);
      
      console.log('✅ is_vod_completed function works');
    } catch (err) {
      console.log('❌ is_vod_completed function error:', err.message);
    }
    
    console.log('\n='.repeat(50));
    console.log('✅ Progress tracking test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the test
if (require.main === module) {
  testProgressTracking();
}

module.exports = { testProgressTracking };
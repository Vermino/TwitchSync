// Debug script to test the complete workflow
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function debugTaskWorkflow() {
  const client = await pool.connect();
  try {
    console.log('=== DEBUGGING TASK-CHANNEL ASSOCIATION ===\n');
    
    // 1. Check the task data (as it would be returned to frontend)
    console.log('1. Task Data from getAllTasks Query:');
    console.log('====================================');
    const taskResult = await client.query(`
      SELECT t.*,
             tm.status as monitoring_status,
             tm.status_message,
             tm.progress_percentage,
             tm.items_total,
             tm.items_completed,
             ts.total_vods,
             ts.successful_downloads,
             jsonb_build_object(
               'percentage', COALESCE(tm.progress_percentage, 0),
               'message', tm.status_message,
               'current_progress', jsonb_build_object(
                 'completed', COALESCE(tm.items_completed, 0),
                 'total', COALESCE(tm.items_total, 0)
               )
             ) as progress
      FROM tasks t
      LEFT JOIN task_monitoring tm ON t.id = tm.task_id
      LEFT JOIN task_statistics ts ON t.id = ts.task_id
      WHERE t.id = 6
    `);
    
    const task = taskResult.rows[0];
    console.log(`Task ID: ${task.id}`);
    console.log(`Channel IDs: ${JSON.stringify(task.channel_ids)} (type: ${typeof task.channel_ids})`);
    console.log(`Game IDs: ${JSON.stringify(task.game_ids)} (type: ${typeof task.game_ids})`);
    console.log();
    
    // 2. Check available channels (as they would be returned to frontend)
    console.log('2. Available Channels from getChannels:');
    console.log('======================================');
    const channelsResult = await client.query(`SELECT id, display_name, username FROM channels ORDER BY id`);
    console.log('All channels:');
    channelsResult.rows.forEach(channel => {
      console.log(`  - Channel ID ${channel.id}: ${channel.display_name} (${channel.username})`);
    });
    console.log();
    
    // 3. Check available games  
    console.log('3. Available Games from getGames:');
    console.log('=================================');
    const gamesResult = await client.query(`SELECT id, name FROM games ORDER BY id`);
    console.log('All games:');
    gamesResult.rows.forEach(game => {
      console.log(`  - Game ID ${game.id}: ${game.name}`);
    });
    console.log();
    
    // 4. Simulate frontend filtering logic
    console.log('4. Frontend Filter Logic Simulation:');
    console.log('====================================');
    const taskChannelIds = task.channel_ids || [];
    const taskGameIds = task.game_ids || [];
    const availableChannels = channelsResult.rows;
    const availableGames = gamesResult.rows;
    
    console.log(`Task channel_ids: ${JSON.stringify(taskChannelIds)}`);
    console.log(`Available channel IDs: [${availableChannels.map(c => c.id).join(', ')}]`);
    console.log();
    
    const matchedChannels = availableChannels.filter(channel => 
      taskChannelIds.includes(channel.id)
    );
    const matchedGames = availableGames.filter(game => 
      taskGameIds.includes(game.id)
    );
    
    console.log(`Matched Channels (${matchedChannels.length}):`);
    matchedChannels.forEach(channel => {
      console.log(`  ✅ ${channel.display_name}`);
    });
    
    console.log(`Matched Games (${matchedGames.length}):`);
    matchedGames.forEach(game => {
      console.log(`  ✅ ${game.name}`);
    });
    
    console.log();
    if (matchedChannels.length === 0) {
      console.log('🚨 ISSUE FOUND: No channels matched!');
      console.log('This explains why the UI shows "Channels (0)"');
    } else {
      console.log('✅ Channels are matching correctly');
      console.log('The issue might be in the frontend data loading or component rendering');
    }
    
  } catch (error) {
    console.error('Error debugging task workflow:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

debugTaskWorkflow();
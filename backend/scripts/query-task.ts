// Quick script to query task details
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS
});

async function queryTask() {
  const client = await pool.connect();
  try {
    console.log('Querying task with ID 6...\n');
    
    const result = await client.query(`
      SELECT 
        id, 
        name, 
        task_type, 
        channel_ids, 
        game_ids, 
        created_at,
        updated_at,
        status,
        is_active
      FROM tasks 
      WHERE id = 6
    `);
    
    if (result.rows.length === 0) {
      console.log('No task found with ID 6');
      return;
    }
    
    const task = result.rows[0];
    console.log('Task Details:');
    console.log('=============');
    console.log(`ID: ${task.id}`);
    console.log(`Name: ${task.name}`);
    console.log(`Type: ${task.task_type}`);
    console.log(`Channel IDs: ${JSON.stringify(task.channel_ids)}`);
    console.log(`Game IDs: ${JSON.stringify(task.game_ids)}`);
    console.log(`Status: ${task.status}`);
    console.log(`Active: ${task.is_active}`);
    console.log(`Created: ${task.created_at}`);
    console.log(`Updated: ${task.updated_at}\n`);
    
    // Also check what channel name corresponds to the IDs
    if (task.channel_ids && task.channel_ids.length > 0) {
      console.log('Channel Details:');
      console.log('================');
      
      const channelResult = await client.query(`
        SELECT id, display_name, login 
        FROM channels 
        WHERE id = ANY($1)
      `, [task.channel_ids]);
      
      channelResult.rows.forEach(channel => {
        console.log(`Channel ID ${channel.id}: ${channel.display_name} (${channel.login})`);
      });
    }
    
    // Check if there are any game details
    if (task.game_ids && task.game_ids.length > 0) {
      console.log('\nGame Details:');
      console.log('=============');
      
      const gameResult = await client.query(`
        SELECT id, name 
        FROM games 
        WHERE id = ANY($1)
      `, [task.game_ids]);
      
      gameResult.rows.forEach(game => {
        console.log(`Game ID ${game.id}: ${game.name}`);
      });
    }
    
  } catch (error) {
    console.error('Error querying task:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

queryTask();
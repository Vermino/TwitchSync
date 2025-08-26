const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'twitchsync',
  user: 'postgres',
  password: 'password'
});

async function checkData() {
  try {
    const client = await pool.connect();
    
    console.log('=== CHANNELS ===');
    const channels = await client.query('SELECT id, username, twitch_id, display_name FROM channels ORDER BY id');
    channels.rows.forEach(ch => {
      console.log(`Channel ${ch.id}: ${ch.username} (${ch.display_name}) - Twitch ID: ${ch.twitch_id}`);
    });
    
    console.log('\n=== TASKS ===');
    const tasks = await client.query('SELECT id, name, channel_ids, game_ids, status FROM tasks ORDER BY id');
    tasks.rows.forEach(task => {
      console.log(`Task ${task.id}: ${task.name} - Status: ${task.status}`);
      console.log(`  Channels: ${JSON.stringify(task.channel_ids)}`);
      console.log(`  Games: ${JSON.stringify(task.game_ids)}`);
    });
    
    client.release();
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
  }
}

checkData();
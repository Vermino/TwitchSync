// Check what tasks exist in the database
require('dotenv').config();
const { Pool } = require('pg');

async function checkTasks() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'twitchsync',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password'
  });

  const client = await pool.connect();
  
  try {
    // Check all tasks
    console.log('📋 All tasks in database:');
    const allTasks = await client.query('SELECT id, user_id, name, status, is_active FROM tasks ORDER BY id');
    console.table(allTasks.rows);

    // Check users
    console.log('\n👥 All users in database:');
    const allUsers = await client.query('SELECT id, username, twitch_id FROM users ORDER BY id');
    console.table(allUsers.rows);

    // Check task 25 specifically
    console.log('\n🔍 Checking task ID 25:');
    const task25 = await client.query('SELECT * FROM tasks WHERE id = 25');
    if (task25.rows.length > 0) {
      console.table(task25.rows);
    } else {
      console.log('Task 25 does not exist');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

checkTasks();
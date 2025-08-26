const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'twitchsync',
  user: 'postgres',
  password: 'password',
});

async function createTestUser() {
  const client = await pool.connect();
  try {
    console.log('Creating test user with ID 1...');
    
    // Try to insert a test user
    const result = await client.query(`
      INSERT INTO users (id, twitch_id, username, email, created_at, updated_at)
      VALUES (1, 'test_user_id', 'test_user', 'test@example.com', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        updated_at = NOW()
      RETURNING id, username
    `);
    
    console.log('Test user created/updated:', result.rows[0]);
  } catch (error) {
    console.error('Error creating test user:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

createTestUser().catch(console.error);
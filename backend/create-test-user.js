// Create a test user and generate a development token
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

async function createTestUser() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'twitchsync',
    user: 'postgres',
    password: 'password'
  });

  const client = await pool.connect();
  
  try {
    // Check if test user already exists
    const existingUser = await client.query(
      'SELECT * FROM users WHERE username = $1',
      ['testuser']
    );

    let user;
    if (existingUser.rows.length > 0) {
      user = existingUser.rows[0];
      console.log('✅ Test user already exists:', user.username);
    } else {
      // Create test user
      const result = await client.query(`
        INSERT INTO users (username, email, twitch_id, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        RETURNING *
      `, ['testuser', 'test@example.com', '12345']);
      
      user = result.rows[0];
      console.log('✅ Created test user:', user.username);
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET || 'development-secret';
    const token = jwt.sign(
      {
        userId: user.id,
        twitchId: user.twitch_id,
        username: user.username
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    console.log('\n🔑 Development Authentication Token:');
    console.log(token);
    console.log('\n📋 To use in frontend, run this in browser console:');
    console.log(`localStorage.setItem('auth_token', '${token}');`);
    console.log('Then refresh the page.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

createTestUser();
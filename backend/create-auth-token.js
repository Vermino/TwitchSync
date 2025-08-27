// Create development authentication token using the same environment as the backend
require('dotenv').config();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

async function createAuthToken() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'twitchsync',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password'
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
      console.log('✅ Using existing test user:', user.username, 'ID:', user.id);
    } else {
      // Create test user
      const result = await client.query(`
        INSERT INTO users (username, email, twitch_id, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        RETURNING *
      `, ['testuser', 'test@example.com', '12345']);
      
      user = result.rows[0];
      console.log('✅ Created test user:', user.username, 'ID:', user.id);
    }

    // Generate JWT token using the same secret and settings as the backend
    const jwtSecret = process.env.JWT_SECRET || 'development-jwt-secret-key-change-in-production';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    
    const token = jwt.sign(
      {
        userId: user.id,
        twitchId: user.twitch_id,
        username: user.username
      },
      jwtSecret,
      { expiresIn }
    );

    console.log('\n🔑 Development Authentication Token:');
    console.log(token);
    console.log('\n📋 To use in frontend, run this in browser console:');
    console.log(`localStorage.setItem('auth_token', '${token}');`);
    console.log('Then refresh the page.');
    
    // Test the token
    const decoded = jwt.verify(token, jwtSecret);
    console.log('\n✅ Token verified successfully. User ID:', decoded.userId);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

createAuthToken();
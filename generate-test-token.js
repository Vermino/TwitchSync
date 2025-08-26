const jwt = require('jsonwebtoken');

// Use the development JWT secret from .env
const JWT_SECRET = 'development-jwt-secret-key-change-in-production';

// Create a test user payload
const payload = {
  userId: 1,
  twitchId: 'test_user_id',
  username: 'test_user'
};

// Generate a test token
const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

console.log('Generated test token:');
console.log(token);
console.log('\nTo use this token, include it in the Authorization header:');
console.log(`Authorization: Bearer ${token}`);
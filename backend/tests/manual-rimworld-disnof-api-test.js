// Manual API Test for Rimworld/disnof workflow
// This script can be run independently to test the specific scenario
// Run with: node tests/manual-rimworld-disnof-api-test.js

const axios = require('axios');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const API_BASE_URL = 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET || 'development-jwt-secret-key-change-in-production';

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'twitchsync',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

class RimworldDisnofWorkflowTester {
  constructor() {
    this.testUserId = null;
    this.authToken = null;
    this.rimworldGameId = null;
    this.disnofChannelId = null;
    this.createdTaskId = null;
  }

  async log(message, data = null) {
    console.log(`[${new Date().toISOString()}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  async error(message, error = null) {
    console.error(`[${new Date().toISOString()}] ❌ ${message}`);
    if (error) {
      console.error(error.message || error);
      if (error.response && error.response.data) {
        console.error('Response data:', error.response.data);
      }
    }
  }

  async success(message, data = null) {
    console.log(`[${new Date().toISOString()}] ✅ ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  async testServerHealth() {
    this.log('🔄 Testing server health...');
    try {
      const response = await axios.get(`${API_BASE_URL}/health`);
      this.success('Server health check passed', response.data);
      return true;
    } catch (error) {
      this.error('Server health check failed', error);
      return false;
    }
  }

  async setupAuthentication() {
    this.log('🔄 Setting up authentication...');
    try {
      // Find or create test user
      let result = await pool.query(
        'SELECT id FROM users WHERE email = $1 LIMIT 1',
        ['test@example.com']
      );

      if (result.rows.length > 0) {
        this.testUserId = result.rows[0].id;
        this.log('Found existing test user', { userId: this.testUserId });
      } else {
        result = await pool.query(
          `INSERT INTO users (username, email, twitch_id, display_name, profile_image_url, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) 
           RETURNING id`,
          ['testuser', 'test@example.com', '123456789', 'Test User', 'https://example.com/avatar.jpg']
        );
        this.testUserId = result.rows[0].id;
        this.log('Created new test user', { userId: this.testUserId });
      }

      // Generate JWT token (matching the expected payload structure)
      this.authToken = jwt.sign(
        { 
          userId: this.testUserId, 
          twitchId: '123456789',
          username: 'testuser',
          email: 'test@example.com' 
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      this.success('Authentication setup complete');
      return true;
    } catch (error) {
      this.error('Authentication setup failed', error);
      return false;
    }
  }

  async testAuthenticationToken() {
    this.log('🔄 Testing authentication token...');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/tasks`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      this.success(`Authentication token works. Found ${response.data.length} existing tasks`);
      return true;
    } catch (error) {
      this.error('Authentication token test failed', error);
      return false;
    }
  }

  async setupGameAndChannel() {
    this.log('🔄 Setting up Rimworld game and disnof channel...');
    try {
      // Setup Rimworld game
      let result = await pool.query(
        "SELECT id, name FROM games WHERE LOWER(name) LIKE '%rimworld%' LIMIT 1"
      );

      if (result.rows.length > 0) {
        this.rimworldGameId = result.rows[0].id;
        this.log('Found existing Rimworld game', { gameId: this.rimworldGameId, name: result.rows[0].name });
      } else {
        result = await pool.query(
          `INSERT INTO games (twitch_id, name, box_art_url, created_at, updated_at) 
           VALUES ($1, $2, $3, NOW(), NOW()) 
           RETURNING id`,
          ['17389', 'RimWorld', 'https://static-cdn.jtvnw.net/ttv-boxart/17389_IGDB-{width}x{height}.jpg']
        );
        this.rimworldGameId = result.rows[0].id;
        this.log('Created Rimworld game', { gameId: this.rimworldGameId });
      }

      // Setup disnof channel
      result = await pool.query(
        "SELECT id, username FROM channels WHERE LOWER(username) LIKE '%disnof%' LIMIT 1"
      );

      if (result.rows.length > 0) {
        this.disnofChannelId = result.rows[0].id;
        this.log('Found existing disnof channel', { channelId: this.disnofChannelId });
      } else {
        result = await pool.query(
          `INSERT INTO channels (twitch_id, username, display_name, follower_count, is_active, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) 
           RETURNING id`,
          ['123456789', 'disnof', 'disnof', 50000, true]
        );
        this.disnofChannelId = result.rows[0].id;
        this.log('Created disnof channel', { channelId: this.disnofChannelId });
      }

      this.success('Game and channel setup complete', {
        rimworldGameId: this.rimworldGameId,
        disnofChannelId: this.disnofChannelId
      });
      return true;
    } catch (error) {
      this.error('Game and channel setup failed', error);
      return false;
    }
  }

  async createTask() {
    this.log('🔄 Creating Rimworld/disnof task...');
    try {
      const taskData = {
        name: 'API Test: Rimworld disnof VOD Task',
        description: 'API test task for Rimworld gameplay by disnof with 1 VOD limit',
        task_type: 'combined',
        channel_ids: [this.disnofChannelId],
        game_ids: [this.rimworldGameId],
        schedule_type: 'manual',
        schedule_value: 'manual',
        priority: 'medium',
        is_active: false,
        auto_delete: false,
        restrictions: {
          maxVodsPerChannel: 1,
          maxTotalVods: 1
        },
        conditions: {
          minFollowers: 1000,
          minViews: 100
        }
      };

      this.log('Task data to be sent:', taskData);

      const response = await axios.post(`${API_BASE_URL}/api/tasks`, taskData, {
        headers: { 
          Authorization: `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });

      this.createdTaskId = response.data.id;
      this.success('Task created successfully', response.data);
      return true;
    } catch (error) {
      this.error('Task creation failed', error);
      return false;
    }
  }

  async testTaskRetrieval() {
    this.log('🔄 Testing task retrieval...');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/tasks/${this.createdTaskId}`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      this.success('Task retrieved successfully', response.data);
      return true;
    } catch (error) {
      this.error('Task retrieval failed', error);
      return false;
    }
  }

  async activateTask() {
    this.log('🔄 Activating task...');
    try {
      const updateData = {
        is_active: true,
        status: 'running',
        start_processing: true
      };

      const response = await axios.put(`${API_BASE_URL}/api/tasks/${this.createdTaskId}`, updateData, {
        headers: { 
          Authorization: `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });

      this.success('Task activated successfully', response.data);
      return true;
    } catch (error) {
      this.error('Task activation failed', error);
      return false;
    }
  }

  async testTaskPause() {
    this.log('🔄 Testing task pause...');
    try {
      const response = await axios.post(`${API_BASE_URL}/api/tasks/${this.createdTaskId}/status/pause`, {}, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      this.success('Task paused successfully', response.data);
      return true;
    } catch (error) {
      this.error('Task pause failed', error);
      return false;
    }
  }

  async testTaskHistory() {
    this.log('🔄 Testing task history...');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/tasks/${this.createdTaskId}/history`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      this.success('Task history retrieved successfully', {
        historyItems: response.data.length,
        history: response.data
      });
      return true;
    } catch (error) {
      this.error('Task history retrieval failed', error);
      return false;
    }
  }

  async testErrorHandling() {
    this.log('🔄 Testing error handling...');
    try {
      // Test invalid priority
      const invalidTaskData = {
        name: 'Invalid Priority Test',
        task_type: 'combined',
        schedule_type: 'manual',
        schedule_value: 'manual',
        priority: 'invalid_priority',
        channel_ids: [this.disnofChannelId],
        game_ids: [this.rimworldGameId]
      };

      try {
        await axios.post(`${API_BASE_URL}/api/tasks`, invalidTaskData, {
          headers: { Authorization: `Bearer ${this.authToken}` }
        });
        this.error('Invalid priority test failed - should have been rejected');
        return false;
      } catch (error) {
        if (error.response && error.response.status === 400) {
          this.success('Invalid priority validation works correctly');
        } else {
          this.error('Unexpected error in invalid priority test', error);
          return false;
        }
      }

      // Test missing authentication
      try {
        await axios.post(`${API_BASE_URL}/api/tasks`, {
          name: 'Unauthenticated Test',
          task_type: 'combined',
          schedule_type: 'manual',
          schedule_value: 'manual'
        });
        this.error('Unauthenticated request test failed - should have been rejected');
        return false;
      } catch (error) {
        if (error.response && error.response.status === 401) {
          this.success('Authentication requirement enforced correctly');
        } else {
          this.error('Unexpected error in authentication test', error);
          return false;
        }
      }

      return true;
    } catch (error) {
      this.error('Error handling test failed', error);
      return false;
    }
  }

  async cleanup() {
    this.log('🔄 Cleaning up test data...');
    try {
      if (this.createdTaskId) {
        await axios.delete(`${API_BASE_URL}/api/tasks/${this.createdTaskId}`, {
          headers: { Authorization: `Bearer ${this.authToken}` }
        });
        this.success('Test task cleaned up successfully');
      }
      return true;
    } catch (error) {
      this.error('Cleanup failed', error);
      return false;
    }
  }

  async runFullTest() {
    this.log('🚀 Starting comprehensive Rimworld/disnof workflow test...');
    
    const testSteps = [
      { name: 'Server Health Check', fn: () => this.testServerHealth() },
      { name: 'Authentication Setup', fn: () => this.setupAuthentication() },
      { name: 'Authentication Token Test', fn: () => this.testAuthenticationToken() },
      { name: 'Game and Channel Setup', fn: () => this.setupGameAndChannel() },
      { name: 'Task Creation', fn: () => this.createTask() },
      { name: 'Task Retrieval', fn: () => this.testTaskRetrieval() },
      { name: 'Task Activation', fn: () => this.activateTask() },
      { name: 'Task Pause', fn: () => this.testTaskPause() },
      { name: 'Task History', fn: () => this.testTaskHistory() },
      { name: 'Error Handling', fn: () => this.testErrorHandling() },
      { name: 'Cleanup', fn: () => this.cleanup() }
    ];

    let passed = 0;
    let failed = 0;

    for (const step of testSteps) {
      this.log(`\n📋 Running: ${step.name}`);
      try {
        const result = await step.fn();
        if (result) {
          passed++;
          this.success(`${step.name} - PASSED`);
        } else {
          failed++;
          this.error(`${step.name} - FAILED`);
        }
      } catch (error) {
        failed++;
        this.error(`${step.name} - ERROR`, error);
      }
    }

    this.log('\n📊 TEST SUMMARY');
    this.log(`Total tests: ${testSteps.length}`);
    this.log(`Passed: ${passed}`);
    this.log(`Failed: ${failed}`);
    
    if (failed === 0) {
      this.success('🎉 ALL TESTS PASSED! Rimworld/disnof workflow is working correctly.');
    } else {
      this.error(`❌ ${failed} tests failed. Please review the errors above.`);
    }

    await pool.end();
    return failed === 0;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const tester = new RimworldDisnofWorkflowTester();
  tester.runFullTest().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

module.exports = RimworldDisnofWorkflowTester;
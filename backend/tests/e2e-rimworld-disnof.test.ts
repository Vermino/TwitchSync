// Comprehensive End-to-End Test for Rimworld/disnof workflow
// Test Requirements:
// 1. Basic API Health Check
// 2. Authentication Setup
// 3. Task Creation Test with Game=Rimworld, Channel=disnof, maxVodsPerChannel=1
// 4. Workflow Verification
// 5. Database/Foreign Key Issues handling

import request from 'supertest';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';

// Load environment variables
config();

const JWT_SECRET = process.env.JWT_SECRET || 'development-jwt-secret-key-change-in-production';

describe('End-to-End: Rimworld/disnof Task Creation Workflow', () => {
  let pool: Pool;
  let app: any;
  let testUserId: number;
  let authToken: string;
  let rimworldGameId: number | null = null;
  let disnofChannelId: number | null = null;

  beforeAll(async () => {
    // Setup database connection
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'twitchsync',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      max: parseInt(process.env.DB_MAX_POOL_SIZE || '20'),
    });

    // Import the app after environment is set up
    const { app: expressApp } = await import('../src/index');
    app = expressApp;

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('1. Basic API Health Check', () => {
    it('should respond with server health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      
      console.log('✅ Server health check passed:', response.body);
    });
  });

  describe('2. Authentication Setup', () => {
    it('should create or find a test user', async () => {
      try {
        // Try to find existing test user
        const existingUser = await pool.query(
          'SELECT id FROM users WHERE email = $1 LIMIT 1',
          ['test@example.com']
        );

        if (existingUser.rows.length > 0) {
          testUserId = existingUser.rows[0].id;
          console.log('✅ Found existing test user with ID:', testUserId);
        } else {
          // Create new test user
          const result = await pool.query(
            `INSERT INTO users (username, email, twitch_id, display_name, profile_image_url, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) 
             RETURNING id`,
            ['testuser', 'test@example.com', '123456789', 'Test User', 'https://example.com/avatar.jpg']
          );
          testUserId = result.rows[0].id;
          console.log('✅ Created new test user with ID:', testUserId);
        }

        // Generate JWT token for the test user (matching expected payload structure)
        authToken = jwt.sign(
          { 
            userId: testUserId, 
            twitchId: '123456789',
            username: 'testuser', 
            email: 'test@example.com' 
          },
          JWT_SECRET,
          { expiresIn: '1h' }
        );

        expect(testUserId).toBeDefined();
        expect(authToken).toBeDefined();
      } catch (error) {
        console.error('❌ Authentication setup failed:', error);
        throw error;
      }
    });

    it('should validate authentication token works', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      console.log('✅ Authentication token validation passed. Found', response.body.length, 'existing tasks');
    });
  });

  describe('3. Game and Channel Setup', () => {
    it('should find or create Rimworld game', async () => {
      try {
        // Search for Rimworld in existing games
        const existingGame = await pool.query(
          "SELECT id, name FROM games WHERE LOWER(name) LIKE '%rimworld%' LIMIT 1"
        );

        if (existingGame.rows.length > 0) {
          rimworldGameId = existingGame.rows[0].id;
          console.log('✅ Found existing Rimworld game with ID:', rimworldGameId, 'Name:', existingGame.rows[0].name);
        } else {
          // Create Rimworld game entry
          const result = await pool.query(
            `INSERT INTO games (twitch_id, name, box_art_url, created_at, updated_at) 
             VALUES ($1, $2, $3, NOW(), NOW()) 
             RETURNING id`,
            ['17389', 'RimWorld', 'https://static-cdn.jtvnw.net/ttv-boxart/17389_IGDB-{width}x{height}.jpg']
          );
          rimworldGameId = result.rows[0].id;
          console.log('✅ Created Rimworld game with ID:', rimworldGameId);
        }
      } catch (error) {
        console.error('❌ Rimworld game setup failed:', error);
        throw error;
      }
    });

    it('should find or create disnof channel', async () => {
      try {
        // Search for disnof in existing channels
        const existingChannel = await pool.query(
          "SELECT id, username FROM channels WHERE LOWER(username) LIKE '%disnof%' LIMIT 1"
        );

        if (existingChannel.rows.length > 0) {
          disnofChannelId = existingChannel.rows[0].id;
          console.log('✅ Found existing disnof channel with ID:', disnofChannelId);
        } else {
          // Create disnof channel entry
          const result = await pool.query(
            `INSERT INTO channels (twitch_id, username, display_name, follower_count, is_active, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) 
             RETURNING id`,
            ['123456789', 'disnof', 'disnof', 50000, true]
          );
          disnofChannelId = result.rows[0].id;
          console.log('✅ Created disnof channel with ID:', disnofChannelId);
        }
      } catch (error) {
        console.error('❌ disnof channel setup failed:', error);
        throw error;
      }
    });
  });

  describe('4. Task Creation Test', () => {
    let createdTaskId: number;

    it('should create task with Rimworld game and disnof channel', async () => {
      const taskData = {
        name: 'E2E Test: Rimworld disnof VOD Task',
        description: 'End-to-end test task for Rimworld gameplay by disnof with 1 VOD limit',
        task_type: 'combined',
        channel_ids: [disnofChannelId],
        game_ids: [rimworldGameId],
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

      console.log('🔄 Creating task with data:', JSON.stringify(taskData, null, 2));

      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(taskData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', taskData.name);
      expect(response.body).toHaveProperty('task_type', 'combined');
      expect(response.body).toHaveProperty('priority', 'medium');
      expect(response.body).toHaveProperty('user_id', testUserId);

      createdTaskId = response.body.id;
      console.log('✅ Task created successfully with ID:', createdTaskId);
      console.log('📝 Task details:', JSON.stringify(response.body, null, 2));
    });

    it('should retrieve the created task', async () => {
      const response = await request(app)
        .get(`/api/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', createdTaskId);
      expect(response.body).toHaveProperty('channel_ids');
      expect(response.body).toHaveProperty('game_ids');
      expect(response.body.channel_ids).toContain(disnofChannelId);
      expect(response.body.game_ids).toContain(rimworldGameId);

      console.log('✅ Task retrieval successful');
      console.log('📝 Retrieved task:', JSON.stringify(response.body, null, 2));
    });

    it('should activate the task for processing', async () => {
      const updateData = {
        is_active: true,
        status: 'running',
        start_processing: true
      };

      const response = await request(app)
        .put(`/api/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('is_active', true);
      console.log('✅ Task activated successfully');
      console.log('📝 Activated task status:', response.body.status);
    });
  });

  describe('5. Workflow Verification', () => {
    it('should verify task appears in user\'s task list', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const createdTask = response.body.find((task: any) => task.name === 'E2E Test: Rimworld disnof VOD Task');
      expect(createdTask).toBeDefined();
      expect(createdTask.channel_ids).toContain(disnofChannelId);
      expect(createdTask.game_ids).toContain(rimworldGameId);

      console.log('✅ Task appears in user\'s task list');
    });

    it('should verify task can be paused', async () => {
      const tasks = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const createdTask = tasks.body.find((task: any) => task.name === 'E2E Test: Rimworld disnof VOD Task');
      
      if (createdTask && createdTask.status === 'running') {
        const response = await request(app)
          .put(`/api/tasks/${createdTask.id}/pause`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        console.log('✅ Task paused successfully');
      } else {
        console.log('⚠️ Task not in running state, skipping pause test');
      }
    });

    it('should handle task history retrieval', async () => {
      const tasks = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const createdTask = tasks.body.find((task: any) => task.name === 'E2E Test: Rimworld disnof VOD Task');
      
      if (createdTask) {
        const response = await request(app)
          .get(`/api/tasks/${createdTask.id}/history`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        console.log('✅ Task history retrieved successfully');
      }
    });
  });

  describe('6. Cleanup', () => {
    it('should clean up test task', async () => {
      const tasks = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const createdTask = tasks.body.find((task: any) => task.name === 'E2E Test: Rimworld disnof VOD Task');
      
      if (createdTask) {
        await request(app)
          .delete(`/api/tasks/${createdTask.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        console.log('✅ Test task cleaned up successfully');
      }
    });
  });

  describe('7. Error Handling Tests', () => {
    it('should handle invalid priority values', async () => {
      const invalidTaskData = {
        name: 'Invalid Priority Test',
        task_type: 'combined',
        schedule_type: 'manual',
        schedule_value: 'manual',
        priority: 'invalid_priority', // This should fail
        channel_ids: [disnofChannelId],
        game_ids: [rimworldGameId]
      };

      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTaskData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      console.log('✅ Invalid priority validation works correctly');
    });

    it('should handle missing authentication', async () => {
      const taskData = {
        name: 'Unauthenticated Test',
        task_type: 'combined',
        schedule_type: 'manual',
        schedule_value: 'manual'
      };

      await request(app)
        .post('/api/tasks')
        .send(taskData)
        .expect(401);

      console.log('✅ Authentication requirement enforced correctly');
    });

    it('should handle invalid task IDs', async () => {
      await request(app)
        .get('/api/tasks/99999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      console.log('✅ Invalid task ID handling works correctly');
    });
  });
});
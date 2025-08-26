// End-to-End Tests - Test complete workflow with real HTTP requests
import request from 'supertest';
import { createApp } from '../src/config/app';
import { Pool } from 'pg';

// Mock external dependencies
jest.mock('../src/config/database');
jest.mock('../src/utils/logger');
jest.mock('../src/services/downloadManager');

// Mock authentication middleware to simulate logged-in user
jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = { id: 1, username: 'testuser' };
    next();
  }
}));

// Mock database operations
const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn()
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

describe('Task Creation E2E Tests', () => {
  let app: any;

  beforeAll(() => {
    app = createApp();
    
    // Mock database connection
    mockPool.connect.mockResolvedValue(mockClient);
    
    // Setup routes with mocked dependencies
    const routes = require('../src/config/routes');
    app.use('/api', routes.createRoutes(mockPool as any, {} as any));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup successful database responses
    mockClient.query.mockImplementation((query: string, params?: any[]) => {
      if (query.includes('INSERT INTO tasks')) {
        return Promise.resolve({
          rows: [{
            id: 1,
            name: params[1], // name is second parameter
            task_type: params[3], // task_type
            priority: params[10] || 'low', // priority with default
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date(),
            user_id: params[0] // user_id is first parameter
          }]
        });
      }
      
      if (query.includes('SELECT') && query.includes('tasks')) {
        return Promise.resolve({
          rows: [{
            id: 1,
            name: 'Test Task',
            task_type: 'game',
            priority: 'medium',
            status: 'pending',
            user_id: 1
          }]
        });
      }

      return Promise.resolve({ rows: [] });
    });
  });

  afterAll(() => {
    if (mockPool.end) {
      mockPool.end();
    }
  });

  describe('POST /api/tasks - Task Creation Workflow', () => {
    test('should successfully create Rimworld/disnof task via HTTP', async () => {
      const rimworldTaskData = {
        name: 'Rimworld VODs - disnof Channel',
        description: 'Download Rimworld VODs from disnof with 1 VOD limit',
        task_type: 'combined',
        channel_ids: [1], // disnof channel ID
        game_ids: [1], // Rimworld game ID  
        schedule_type: 'manual',
        schedule_value: 'manual',
        priority: 'medium',
        restrictions: {
          maxVodsPerChannel: 1,
          maxTotalVods: 1
        },
        conditions: {
          minDuration: 300, // 5 minutes
          requireChat: true
        }
      };

      const response = await request(app)
        .post('/api/tasks')
        .send(rimworldTaskData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(Number),
        name: 'Rimworld VODs - disnof Channel',
        task_type: 'combined',
        priority: 'medium',
        status: 'pending'
      });

      // Verify database interaction
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tasks'),
        expect.arrayContaining([
          1, // user_id
          'Rimworld VODs - disnof Channel', // name
          expect.any(String), // description
          'combined' // task_type
        ])
      );
    });

    test('should reject task creation with invalid priority via HTTP', async () => {
      const invalidTaskData = {
        name: 'Invalid Priority Task',
        task_type: 'game',
        schedule_type: 'manual',
        schedule_value: 'manual',
        priority: 'urgent' // Invalid priority
      };

      const response = await request(app)
        .post('/api/tasks')
        .send(invalidTaskData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: expect.arrayContaining(['priority'])
          })
        ])
      });

      // Verify no database interaction for invalid data
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tasks'),
        expect.any(Array)
      );
    });

    test('should accept all valid priority values via HTTP', async () => {
      const priorities = ['low', 'medium', 'high'];
      
      for (const priority of priorities) {
        const taskData = {
          name: `Test Task - ${priority} Priority`,
          task_type: 'game',
          schedule_type: 'manual',
          schedule_value: 'manual',
          priority
        };

        const response = await request(app)
          .post('/api/tasks')
          .send(taskData)
          .expect('Content-Type', /json/)
          .expect(201);

        expect(response.body.priority).toBe(priority);
        
        // Clear mocks between iterations
        jest.clearAllMocks();
        mockClient.query.mockImplementation((query: string, params?: any[]) => {
          if (query.includes('INSERT INTO tasks')) {
            return Promise.resolve({
              rows: [{
                id: Math.floor(Math.random() * 1000),
                priority: priority,
                name: params[1],
                task_type: params[3],
                status: 'pending',
                user_id: 1
              }]
            });
          }
          return Promise.resolve({ rows: [] });
        });
      }
    });

    test('should handle missing priority with default value via HTTP', async () => {
      const taskWithoutPriority = {
        name: 'Task Without Priority',
        task_type: 'game',
        schedule_type: 'manual',
        schedule_value: 'manual'
      };

      const response = await request(app)
        .post('/api/tasks')
        .send(taskWithoutPriority)
        .expect('Content-Type', /json/)
        .expect(201);

      // Should default to 'low' priority
      expect(response.body.priority).toBe('low');
    });
  });

  describe('PUT /api/tasks/:id - Task Update Workflow', () => {
    test('should successfully update task priority via HTTP', async () => {
      // Mock task exists check and update
      mockClient.query.mockImplementation((query: string, params?: any[]) => {
        if (query.includes('UPDATE tasks')) {
          return Promise.resolve({
            rows: [{
              id: 1,
              name: 'Updated Task',
              priority: params.find((p: any) => ['low', 'medium', 'high'].includes(p)) || 'low',
              status: 'pending',
              user_id: 1,
              updated_at: new Date()
            }]
          });
        }
        return Promise.resolve({ rows: [{ id: 1, user_id: 1 }] });
      });

      const updateData = {
        priority: 'high',
        is_active: true
      };

      const response = await request(app)
        .put('/api/tasks/1')
        .send(updateData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.priority).toBe('high');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks'),
        expect.any(Array)
      );
    });

    test('should reject invalid priority updates via HTTP', async () => {
      const invalidUpdateData = {
        priority: 'emergency' // Invalid priority
      };

      const response = await request(app)
        .put('/api/tasks/1')
        .send(invalidUpdateData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Validation failed',
        details: expect.any(Array)
      });
    });
  });

  describe('POST /api/tasks/:id/run - Manual Task Execution', () => {
    test('should successfully start Rimworld/disnof task manually via HTTP', async () => {
      // Mock task toggle and update operations
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] }) // Task exists check
        .mockResolvedValueOnce({ rows: [] }) // Toggle operation
        .mockResolvedValueOnce({ // Update operation
          rows: [{
            id: 1,
            name: 'Rimworld VODs - disnof Channel',
            status: 'running',
            is_active: true,
            priority: 'medium',
            monitoring_enabled: true,
            user_id: 1
          }]
        });

      const response = await request(app)
        .post('/api/tasks/1/run')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toMatchObject({
        id: 1,
        status: 'running',
        is_active: true
      });

      // Verify multiple database operations
      expect(mockClient.query).toHaveBeenCalledTimes(3);
    });

    test('should handle task not found during manual run via HTTP', async () => {
      // Mock task not found
      mockClient.query.mockRejectedValueOnce(new Error('Task not found or access denied'));

      const response = await request(app)
        .post('/api/tasks/999/run')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body.error).toBe('Task not found');
    });
  });

  describe('Workflow Integration Tests', () => {
    test('should complete full Rimworld/disnof workflow: create -> activate -> monitor', async () => {
      let taskId: number;

      // Step 1: Create task
      const createData = {
        name: 'E2E Rimworld Test',
        description: 'Full workflow test for disnof Rimworld VODs',
        task_type: 'combined',
        channel_ids: [1],
        game_ids: [1],
        schedule_type: 'manual',
        schedule_value: 'manual',
        priority: 'medium',
        restrictions: { maxVodsPerChannel: 1 }
      };

      const createResponse = await request(app)
        .post('/api/tasks')
        .send(createData)
        .expect(201);

      taskId = createResponse.body.id;
      expect(createResponse.body.status).toBe('pending');
      expect(createResponse.body.priority).toBe('medium');

      // Step 2: Activate task
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: taskId, user_id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: taskId,
            status: 'running',
            is_active: true,
            monitoring_enabled: true
          }]
        });

      const runResponse = await request(app)
        .post(`/api/tasks/${taskId}/run`)
        .expect(200);

      expect(runResponse.body.status).toBe('running');
      expect(runResponse.body.is_active).toBe(true);

      // Step 3: Check task details
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: taskId,
          name: 'E2E Rimworld Test',
          status: 'running',
          is_active: true,
          priority: 'medium',
          restrictions: '{"maxVodsPerChannel":1}',
          user_id: 1
        }]
      });

      const detailsResponse = await request(app)
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(detailsResponse.body).toMatchObject({
        id: taskId,
        name: 'E2E Rimworld Test',
        status: 'running',
        is_active: true,
        priority: 'medium'
      });
    });
  });
});
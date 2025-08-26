// API Integration Tests - Test complete API flow with mocked database
import { Request, Response } from 'express';
import { TasksController } from '../src/routes/tasks/controller';
import { TaskOperations } from '../src/routes/tasks/operations';

// Mock the operations
jest.mock('../src/routes/tasks/operations');
jest.mock('../src/utils/logger');

describe('Tasks API Integration Tests', () => {
  let controller: TasksController;
  let mockOperations: jest.Mocked<TaskOperations>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    // Create mocked operations
    mockOperations = {
      createTask: jest.fn(),
      getAllTasks: jest.fn(),
      getTaskById: jest.fn(),
      updateTask: jest.fn(),
      deleteTask: jest.fn(),
      toggleTaskState: jest.fn(),
      pauseTask: jest.fn(),
      getTaskHistory: jest.fn(),
      getTaskManagerDetails: jest.fn(),
      batchUpdateTasks: jest.fn(),
      batchDeleteTasks: jest.fn(),
    } as any;

    controller = new TasksController(mockOperations);

    // Setup mock response
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Setup base mock request
    mockRequest = {
      user: { id: 1 },
      params: {},
      body: {},
      query: {}
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTask API endpoint', () => {
    test('should successfully create task with valid Rimworld/disnof data', async () => {
      const rimworldTaskData = {
        name: 'Rimworld VODs - disnof Channel',
        description: 'Download Rimworld VODs from disnof with 1 VOD limit',
        task_type: 'combined',
        channel_ids: [1], // disnof
        game_ids: [1], // Rimworld
        schedule_type: 'manual',
        schedule_value: 'manual',
        priority: 'medium',
        restrictions: {
          maxVodsPerChannel: 1,
          maxTotalVods: 1
        },
        conditions: {
          minDuration: 300,
          requireChat: true
        }
      };

      const expectedTask = {
        id: 1,
        ...rimworldTaskData,
        user_id: 1,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockOperations.createTask.mockResolvedValue(expectedTask as any);
      mockRequest.body = rimworldTaskData;

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockOperations.createTask).toHaveBeenCalledWith(1, rimworldTaskData);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(expectedTask);
    });

    test('should handle validation errors for invalid priority', async () => {
      const invalidTaskData = {
        name: 'Test Task',
        task_type: 'game',
        schedule_type: 'manual',
        schedule_value: 'manual',
        priority: 'urgent' // Invalid priority
      };

      mockRequest.body = invalidTaskData;

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockOperations.createTask).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: expect.arrayContaining(['priority'])
          })
        ])
      });
    });

    test('should accept all valid priority values', async () => {
      const priorities = ['low', 'medium', 'high'];
      
      for (const priority of priorities) {
        const taskData = {
          name: `Test Task - ${priority}`,
          task_type: 'game',
          schedule_type: 'manual',
          schedule_value: 'manual',
          priority
        };

        const expectedTask = { id: 1, ...taskData, user_id: 1, status: 'pending' };
        mockOperations.createTask.mockResolvedValue(expectedTask as any);
        mockRequest.body = taskData;

        await controller.createTask(mockRequest as Request, mockResponse as Response);

        expect(mockOperations.createTask).toHaveBeenCalledWith(1, taskData);
        expect(mockResponse.status).toHaveBeenCalledWith(201);
      }
    });

    test('should handle authentication errors', async () => {
      mockRequest.user = undefined;
      mockRequest.body = {
        name: 'Test Task',
        task_type: 'game',
        schedule_type: 'manual',
        schedule_value: 'manual'
      };

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockOperations.createTask).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });
  });

  describe('updateTask API endpoint', () => {
    test('should successfully update task with valid priority', async () => {
      const updateData = {
        priority: 'high',
        is_active: true
      };

      const updatedTask = {
        id: 1,
        name: 'Updated Task',
        priority: 'high',
        is_active: true,
        user_id: 1
      };

      mockOperations.updateTask.mockResolvedValue(updatedTask as any);
      mockRequest.params = { id: '1' };
      mockRequest.body = updateData;

      await controller.updateTask(mockRequest as Request, mockResponse as Response);

      expect(mockOperations.updateTask).toHaveBeenCalledWith(1, 1, updateData);
      expect(mockResponse.json).toHaveBeenCalledWith(updatedTask);
    });

    test('should handle task activation with processing', async () => {
      const updateData = {
        status: 'running',
        is_active: true,
        start_processing: true
      };

      const activatedTask = {
        id: 1,
        name: 'Activated Task',
        status: 'running',
        is_active: true,
        user_id: 1
      };

      mockOperations.toggleTaskState.mockResolvedValue(undefined);
      mockOperations.updateTask.mockResolvedValue(activatedTask as any);
      mockRequest.params = { id: '1' };
      mockRequest.body = updateData;

      await controller.updateTask(mockRequest as Request, mockResponse as Response);

      expect(mockOperations.toggleTaskState).toHaveBeenCalledWith(1, 1, true);
      expect(mockOperations.updateTask).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(activatedTask);
    });

    test('should reject invalid priority updates', async () => {
      const updateData = {
        priority: 'critical' // Invalid priority
      };

      mockRequest.params = { id: '1' };
      mockRequest.body = updateData;

      await controller.updateTask(mockRequest as Request, mockResponse as Response);

      expect(mockOperations.updateTask).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.any(Array)
      });
    });
  });

  describe('manualRunTask API endpoint', () => {
    test('should successfully start Rimworld/disnof task manually', async () => {
      const runningTask = {
        id: 1,
        name: 'Rimworld VODs - disnof Channel',
        task_type: 'combined',
        status: 'running',
        is_active: true,
        monitoring_enabled: true,
        monitoring_status: 'active',
        user_id: 1
      };

      mockOperations.toggleTaskState.mockResolvedValue(undefined);
      mockOperations.updateTask.mockResolvedValue(runningTask as any);
      mockRequest.params = { id: '1' };

      await controller.manualRunTask(mockRequest as Request, mockResponse as Response);

      expect(mockOperations.toggleTaskState).toHaveBeenCalledWith(1, 1, true);
      expect(mockOperations.updateTask).toHaveBeenCalledWith(1, 1, {
        status: 'running',
        is_active: true
      });
      expect(mockResponse.json).toHaveBeenCalledWith(runningTask);
    });

    test('should handle task not found errors', async () => {
      mockOperations.toggleTaskState.mockRejectedValue(new Error('Task not found or access denied'));
      mockRequest.params = { id: '999' };

      await controller.manualRunTask(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Task not found' });
    });
  });

  describe('batchUpdateTasks API endpoint', () => {
    test('should successfully batch update tasks with priority changes', async () => {
      const batchUpdateData = {
        task_ids: [1, 2, 3],
        updates: {
          priority: 'high',
          is_active: false
        }
      };

      const updatedTasks = [
        { id: 1, priority: 'high', is_active: false },
        { id: 2, priority: 'high', is_active: false },
        { id: 3, priority: 'high', is_active: false }
      ];

      mockOperations.batchUpdateTasks.mockResolvedValue(updatedTasks as any);
      mockRequest.body = batchUpdateData;

      await controller.batchUpdateTasks(mockRequest as Request, mockResponse as Response);

      expect(mockOperations.batchUpdateTasks).toHaveBeenCalledWith(1, batchUpdateData);
      expect(mockResponse.json).toHaveBeenCalledWith(updatedTasks);
    });

    test('should reject batch updates with invalid priority', async () => {
      const batchUpdateData = {
        task_ids: [1, 2, 3],
        updates: {
          priority: 'emergency', // Invalid priority
          is_active: false
        }
      };

      mockRequest.body = batchUpdateData;

      await controller.batchUpdateTasks(mockRequest as Request, mockResponse as Response);

      expect(mockOperations.batchUpdateTasks).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.any(Array)
      });
    });
  });
});
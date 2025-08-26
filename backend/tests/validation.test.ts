// Backend Unit Tests - Test validation schemas directly
import { 
  CreateTaskSchema, 
  UpdateTaskSchema,
  TaskPriorityEnum,
  TaskTypeEnum,
  TaskScheduleTypeEnum,
  BatchUpdateTasksSchema
} from '../src/routes/tasks/validation';

describe('Task Validation Schemas', () => {
  describe('TaskPriorityEnum', () => {
    test('should accept valid priority values', () => {
      expect(() => TaskPriorityEnum.parse('low')).not.toThrow();
      expect(() => TaskPriorityEnum.parse('medium')).not.toThrow();
      expect(() => TaskPriorityEnum.parse('high')).not.toThrow();
    });

    test('should reject invalid priority values', () => {
      expect(() => TaskPriorityEnum.parse('urgent')).toThrow();
      expect(() => TaskPriorityEnum.parse('critical')).toThrow();
      expect(() => TaskPriorityEnum.parse('normal')).toThrow();
      expect(() => TaskPriorityEnum.parse('')).toThrow();
      expect(() => TaskPriorityEnum.parse(null)).toThrow();
    });
  });

  describe('CreateTaskSchema', () => {
    const validBaseTask = {
      name: 'Test Rimworld Task',
      description: 'Test task for Rimworld VODs',
      task_type: 'game' as const,
      channel_ids: [1], // disnof channel ID
      game_ids: [1], // Rimworld game ID
      schedule_type: 'manual' as const,
      schedule_value: 'manual',
      priority: 'medium' as const,
      restrictions: {
        maxVodsPerChannel: 1
      }
    };

    test('should accept valid task creation data', () => {
      const result = CreateTaskSchema.safeParse(validBaseTask);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priority).toBe('medium');
        expect(result.data.name).toBe('Test Rimworld Task');
        expect(result.data.task_type).toBe('game');
      }
    });

    test('should accept all valid priority values', () => {
      const lowPriorityTask = { ...validBaseTask, priority: 'low' as const };
      const mediumPriorityTask = { ...validBaseTask, priority: 'medium' as const };
      const highPriorityTask = { ...validBaseTask, priority: 'high' as const };

      expect(CreateTaskSchema.safeParse(lowPriorityTask).success).toBe(true);
      expect(CreateTaskSchema.safeParse(mediumPriorityTask).success).toBe(true);
      expect(CreateTaskSchema.safeParse(highPriorityTask).success).toBe(true);
    });

    test('should default priority to low if not provided', () => {
      const taskWithoutPriority = { ...validBaseTask };
      delete (taskWithoutPriority as any).priority;

      const result = CreateTaskSchema.safeParse(taskWithoutPriority);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priority).toBe('low');
      }
    });

    test('should reject invalid priority values', () => {
      const invalidPriorityTask = { ...validBaseTask, priority: 'urgent' };
      const result = CreateTaskSchema.safeParse(invalidPriorityTask);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors).toContainEqual(
          expect.objectContaining({
            path: ['priority'],
            message: expect.stringMatching(/Invalid enum value/)
          })
        );
      }
    });

    test('should handle Rimworld/disnof specific scenario', () => {
      const rimworldDisnofTask = {
        name: 'Rimworld VODs - disnof Channel',
        description: 'Download Rimworld VODs from disnof with 1 VOD limit',
        task_type: 'combined' as const,
        channel_ids: [1], // Assuming disnof has ID 1
        game_ids: [1], // Assuming Rimworld has ID 1
        schedule_type: 'manual' as const,
        schedule_value: 'manual',
        priority: 'medium' as const,
        restrictions: {
          maxVodsPerChannel: 1,
          maxTotalVods: 1
        },
        conditions: {
          minDuration: 300, // 5 minutes
          requireChat: true
        }
      };

      const result = CreateTaskSchema.safeParse(rimworldDisnofTask);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.restrictions?.maxVodsPerChannel).toBe(1);
        expect(result.data.restrictions?.maxTotalVods).toBe(1);
      }
    });

    test('should require name field', () => {
      const taskWithoutName = { ...validBaseTask };
      delete (taskWithoutName as any).name;

      const result = CreateTaskSchema.safeParse(taskWithoutName);
      expect(result.success).toBe(false);
    });

    test('should validate schedule constraints', () => {
      // Test interval validation
      const intervalTask = { 
        ...validBaseTask, 
        schedule_type: 'interval' as const,
        schedule_value: '300' // 5 minutes minimum
      };
      expect(CreateTaskSchema.safeParse(intervalTask).success).toBe(true);

      // Test invalid interval (too short)
      const shortIntervalTask = { 
        ...validBaseTask, 
        schedule_type: 'interval' as const,
        schedule_value: '60' // 1 minute - too short
      };
      expect(CreateTaskSchema.safeParse(shortIntervalTask).success).toBe(false);
    });
  });

  describe('UpdateTaskSchema', () => {
    test('should accept partial updates with valid priority', () => {
      const updateData = {
        priority: 'high' as const,
        is_active: true
      };

      const result = UpdateTaskSchema.safeParse(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priority).toBe('high');
      }
    });

    test('should reject invalid priority in updates', () => {
      const updateData = {
        priority: 'urgent',
        is_active: true
      };

      const result = UpdateTaskSchema.safeParse(updateData);
      expect(result.success).toBe(false);
    });
  });

  describe('BatchUpdateTasksSchema', () => {
    test('should validate batch updates with priority changes', () => {
      const batchUpdate = {
        task_ids: [1, 2, 3],
        updates: {
          priority: 'high' as const,
          is_active: false
        }
      };

      const result = BatchUpdateTasksSchema.safeParse(batchUpdate);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.updates.priority).toBe('high');
      }
    });

    test('should reject invalid priority in batch updates', () => {
      const batchUpdate = {
        task_ids: [1, 2, 3],
        updates: {
          priority: 'critical', // Invalid priority
          is_active: false
        }
      };

      const result = BatchUpdateTasksSchema.safeParse(batchUpdate);
      expect(result.success).toBe(false);
    });
  });
});
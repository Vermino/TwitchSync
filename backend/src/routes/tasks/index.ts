// Filepath: backend/src/routes/tasks/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import DownloadManager from '../../services/downloadManager/index';
import { authenticate } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validation';
import { TaskOperations } from './operations';
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  BatchUpdateTasksSchema,
  BatchDeleteTasksSchema
} from './validation';
import { TasksController } from './controller';
import { TaskScheduler } from '../../services/taskScheduler';

export function setupTaskRoutes(pool: Pool) {
  const router = Router();

  // Initialize managers and operations
  const downloadManager = DownloadManager.getInstance(pool, {
    tempDir: process.env.TEMP_DIR || './temp',
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3'),
    retryAttempts: parseInt(process.env.DOWNLOAD_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.DOWNLOAD_RETRY_DELAY || '5000'),
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '3600')
  });

  const taskScheduler = new TaskScheduler(pool, downloadManager);
  const taskOperations = new TaskOperations(pool, downloadManager);
  const controller = new TasksController(taskOperations);

  // Scheduler routes (must be before /:id to avoid capture)
  router.get('/scheduler/status',
    authenticate(pool),
    (_req, res) => {
      const status = taskScheduler.getStatus();
      res.json({ enabled: status.isRunning, ...status });
    }
  );

  router.post('/scheduler/toggle',
    authenticate(pool),
    (_req, res) => {
      const status = taskScheduler.getStatus();
      if (status.isRunning) {
        taskScheduler.stop();
        res.json({ enabled: false, message: 'Task scheduler stopped' });
      } else {
        taskScheduler.start();
        res.json({ enabled: true, message: 'Task scheduler started' });
      }
    }
  );

  // CRUD routes
  router.get('/', authenticate(pool), controller.getAllTasks);
  router.post('/', authenticate(pool), controller.createTask);
  router.get('/:id', authenticate(pool), controller.getTaskById);
  router.put('/:id', authenticate(pool), validateRequest(UpdateTaskSchema), controller.updateTask);
  router.delete('/:id', authenticate(pool), controller.deleteTask);
  router.get('/:id/history', authenticate(pool), controller.getTaskHistory);
  router.get('/:id/details', authenticate(pool), controller.getTaskDetails);
  router.post('/:id/run', authenticate(pool), controller.manualRunTask);
  router.post('/:id/status/pause', authenticate(pool), controller.pauseTask);
  router.post('/:id/status/resume', authenticate(pool), controller.resumeTask);
  router.post('/:id/activate', authenticate(pool), controller.activateTask);

  // Batch operations
  router.post('/batch', authenticate(pool), validateRequest(BatchUpdateTasksSchema), controller.batchUpdateTasks);
  router.post('/batch-delete', authenticate(pool), validateRequest(BatchDeleteTasksSchema), controller.batchDeleteTasks);

  return router;
}

export default setupTaskRoutes;

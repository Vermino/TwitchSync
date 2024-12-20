// Filepath: backend/src/routes/tasks/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../../middleware/auth';
import { createTasksController } from './controller';
import { validateRequest } from '../../middleware/validation';
import DownloadManager from '../../services/downloadManager';
import { TaskError } from './validation';
import {
  SearchTaskSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  DeleteTaskSchema
} from './validation';

export function setupTaskRoutes(pool: Pool) {
  const router = Router();
  const downloadManager = DownloadManager.getInstance(pool, {
    tempDir: process.env.TEMP_DIR || './temp',
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3'),
    retryAttempts: parseInt(process.env.DOWNLOAD_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.DOWNLOAD_RETRY_DELAY || '5000'),
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '3600')
  });
  const controller = createTasksController(pool, downloadManager);

  // Use bound methods from the controller instance
  router.get('/', controller.getAllTasks);
  router.post('/', validateRequest(CreateTaskSchema), controller.createTask);
  router.get('/:id', validateRequest(DeleteTaskSchema), controller.getTaskById);
  router.get('/:id/details', validateRequest(DeleteTaskSchema), controller.getTaskDetails);
  router.put('/:id', validateRequest(UpdateTaskSchema), controller.updateTask);
  router.delete('/:id', validateRequest(DeleteTaskSchema), controller.deleteTask);
  router.get('/:id/history', validateRequest(DeleteTaskSchema), controller.getTaskHistory);
  router.post('/:id/run', validateRequest(DeleteTaskSchema), controller.manualRunTask);

  return router;
}

export default setupTaskRoutes;

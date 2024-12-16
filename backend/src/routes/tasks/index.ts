// backend/src/routes/tasks/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { createTasksController } from './controller';
import { authenticate } from '../../middleware/auth';

const validateIdParam = (req: any, res: any, next: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }
  next();
};

export const setupTaskRoutes = (pool: Pool) => {
  const router = Router();
  const controller = createTasksController(pool);

  router.use(authenticate(pool));

  // Use bound methods from the controller instance
  router.get('/', controller.getAllTasks);
  router.post('/', controller.createTask);
  router.get('/:id', validateIdParam, controller.getTaskById);
  router.put('/:id', validateIdParam, controller.updateTask);
  router.delete('/:id', validateIdParam, controller.deleteTask);
  router.get('/:id/history', validateIdParam, controller.getTaskHistory);
  router.post('/:id/run', validateIdParam, controller.manualRunTask);

  return router;
};

export default setupTaskRoutes;

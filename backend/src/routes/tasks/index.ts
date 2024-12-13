// backend/src/routes/tasks/index.ts

import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { TasksController } from './controller';
import { validateTaskId } from './validation';

export function setupTaskRoutes(pool: Pool): Router {
    const router = Router();
    const controller = new TasksController(pool);

    // Middleware to validate task ID parameter
    const validateIdParam = (
        req: Request,
        res: Response,
        next: NextFunction
    ): void => {
        const error = validateTaskId(req.params.id);
        if (error) {
            res.status(400).json({ error });
            return;
        }
        next();
    };

    // Task Routes
    router.get('/', controller.getAllTasks);
    router.get('/:id', validateIdParam, controller.getTaskById);
    router.get('/:id/history', validateIdParam, controller.getTaskHistory);
    router.post('/', controller.createTask);
    router.put('/:id', validateIdParam, controller.updateTask);
    router.delete('/:id', validateIdParam, controller.deleteTask);
    router.post('/:id/run', validateIdParam, controller.manualRunTask);

    return router;
}

export default setupTaskRoutes;

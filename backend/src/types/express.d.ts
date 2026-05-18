// Filepath: backend/src/types/express.d.ts

import { Request as ExpressRequest } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        email: string;
      };
    }
  }
}
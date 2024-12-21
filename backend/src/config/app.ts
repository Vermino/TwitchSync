// Filepath: backend/src/config/app.ts

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from '../utils/logger';

export function createApp() {
  const app = express();

  // Security configuration
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        scriptSrc: process.env.NODE_ENV === 'development'
          ? ["'self'", "'unsafe-eval'"]
          : ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));

  // CORS configuration
  const corsOptions = {
    origin: process.env.NODE_ENV === 'development'
      ? ['http://localhost:3000', 'http://127.0.0.1:3000']
      : process.env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600
  };
  app.use(cors(corsOptions));

  // Basic parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  return app;
}

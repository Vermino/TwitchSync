// backend/src/middleware/error.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface APIError extends Error {
  status?: number;
  code?: string;
}

export const errorHandler = (
  err: APIError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('API Error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Handle specific error types
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({
      error: 'Database connection failed',
      code: 'DATABASE_ERROR'
    });
  }

  if (err.message.includes('Twitch API')) {
    return res.status(503).json({
      error: 'Twitch API service unavailable',
      code: 'TWITCH_API_ERROR'
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR'
  });
};

// frontend/src/components/LoadingState.tsx
import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...'
}) => (
  <div className="flex flex-col items-center justify-center min-h-[200px] p-8">
    <Loader2 className="w-8 h-8 animate-spin text-purple-600 mb-4" />
    <p className="text-gray-600">{message}</p>
  </div>
);

// frontend/src/components/ErrorState.tsx
import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';

interface ErrorStateProps {
  error: Error;
  resetErrorBoundary?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  error,
  resetErrorBoundary
}) => {
  // Map error codes to user-friendly messages
  const getErrorMessage = (error: any) => {
    switch (error?.code) {
      case 'DATABASE_ERROR':
        return 'Unable to connect to the database. Please try again later.';
      case 'TWITCH_API_ERROR':
        return 'Unable to connect to Twitch. Please check your connection and try again.';
      default:
        return error.message || 'An unexpected error occurred';
    }
  };

  return (
    <div className="p-4">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{getErrorMessage(error)}</AlertDescription>
      </Alert>
      {resetErrorBoundary && (
        <button
          onClick={resetErrorBoundary}
          className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          Try Again
        </button>
      )}
    </div>
  );
};

// frontend/src/lib/api.ts
import axios, { AxiosError } from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

api.interceptors.response.use(
  response => response,
  (error: AxiosError) => {
    // Add more specific error handling
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timed out. Please check your connection.');
    }

    if (error.response?.status === 503) {
      const data = error.response.data as any;
      throw new Error(data.error || 'Service temporarily unavailable');
    }

    throw error;
  }
);

export { api };

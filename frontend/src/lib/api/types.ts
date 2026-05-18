// Filepath: frontend/src/lib/api/types.ts

// Common response type for paginated results
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor?: string;
    hasMore: boolean;
  };
}

// Common error response
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

// Generic API response
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

// Re-export types from other modules
export * from '@/types';
export * from '@/types/discovery';

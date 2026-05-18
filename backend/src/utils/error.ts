export interface AppError extends Error {
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

export class ApplicationError extends Error implements AppError {
  constructor(
    message: string,
    public code?: string,
    public status: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export const handleError = (error: unknown): AppError => {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (error instanceof Error) {
    return new ApplicationError(error.message);
  }

  return new ApplicationError('An unknown error occurred');
};

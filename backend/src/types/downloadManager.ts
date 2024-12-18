// Filepath: backend/src/types/downloadManager.ts

export interface DownloadManagerConfig {
  tempDir: string;
  maxConcurrent: number;
  retryAttempts: number;
  retryDelay: number;
  cleanupInterval: number;
}

// Filepath: backend/src/types/downloadManager.ts

import { TaskDetails } from './database';
import { DownloadPriority } from './database';

export interface SystemResources {
  memoryUsage: {
    total: number;
    free: number;
    processUsage: number;
  };
  diskSpace: {
    total: number;
    free: number;
    available: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
}

export interface ResourceWarning {
  type: 'memory' | 'disk' | 'cpu';
  current: number;
  threshold: number;
  message: string;
}

export interface ResourceCritical extends ResourceWarning {
  action: 'pause' | 'shutdown';
}

export interface ResourceThresholds {
  maxMemoryUsage: number;
  minDiskSpace: number;
  maxCpuUsage: number;
}

export interface SegmentInfo {
  index: number;
  url: string;
  duration: number;
  checksum?: string;
}

export interface SegmentedPlaylist {
  segments: SegmentInfo[];
  duration: number;
  quality: string;
}

export interface DownloadProgress {
  vodId: number;
  segmentIndex: number;
  totalSegments: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed: number;
  eta: number;
  status: string;
}

export interface DownloadState {
  vodId: number;
  progress: DownloadProgress;
  activeSegments: Set<number>;
  completedSegments: Set<number>;
  failedSegments: Set<number>;
  checksums: Map<number, string>;
  resumePosition: number;
  throttle: {
    enabled: boolean;
    bytesPerSecond: number;
    lastCheck: number;
    bytesSinceLastCheck: number;
  };
  resources: {
    startMemory: number;
    peakMemory: number;
    startTime: number;
    diskUsage: number;
  };
}

export interface DownloadManagerConfig {
  tempDir: string;
  maxConcurrent: number;
  retryAttempts: number;
  retryDelay: number;
  cleanupInterval: number;
  shutdownTimeout?: number;
}

export interface QueueStatus {
  pending: number;
  downloading: number;
  failed: number;
  completed: number;
}

export interface DownloadMetrics {
  totalBytesDownloaded: number;
  totalDownloads: number;
  failedDownloads: number;
  averageSpeed: number;
  peakMemoryUsage: number;
  startTime: number;
}

export interface IDownloadManager {
  addToQueue(vodId: number, priority?: DownloadPriority): Promise<void>;
  getQueueStatus(): Promise<QueueStatus>;
  retryFailedDownload(vodId: number): Promise<void>;
  cancelDownload(vodId: number): Promise<void>;
  getTaskDetails(taskId: number): Promise<TaskDetails>;
  executeTask(taskId: number): Promise<void>;
  startProcessing(intervalSeconds?: number): Promise<void>;
  stopProcessing(timeoutMs?: number): Promise<void>;
  getSystemResources(): Promise<SystemResources>;
  getMetrics(): DownloadMetrics;
  getActiveDownloads(): Map<number, DownloadState>;
}

// Re-export necessary types
export type { TaskDetails, DownloadPriority };

// Filepath: backend/src/services/downloadManager/types.ts

import { VideoQuality, DownloadPriority } from '../../types/database';

export { VideoQuality, DownloadPriority };  // Re-export these types

export interface DownloadManagerConfig {
  tempDir: string;
  maxConcurrent: number;
  retryAttempts: number;
  retryDelay: number;
  cleanupInterval: number;
  shutdownTimeout?: number;
}

export interface DownloadProgress {
  vodId: number;
  segmentIndex: number;
  totalSegments: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed: number;
  eta: number;
  status: 'downloading' | 'paused' | 'completed' | 'failed';
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

export interface PlaylistQuality {
  quality: VideoQuality;
  segments: Array<{
    url: string;
    duration: number;
    checksum?: string;
  }>;
}

export interface VodPlaylist {
  qualities: PlaylistQuality[];
  duration: number;
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
  quality: VideoQuality;
}

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

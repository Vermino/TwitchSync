// Storage management types

export interface StorageAnalytics {
  totalFiles: number;
  totalSizeGB: number;
  downloadedFiles: number;
  downloadedSizeGB: number;
  missingFiles: number;
  missingSizeGB: number;
  corruptedFiles: number;
  corruptedSizeGB: number;
  protectedFiles: number;
  protectedSizeGB: number;
  channelBreakdown: ChannelStorageBreakdown[];
  gameBreakdown: GameStorageBreakdown[];
  storageTimeline: StorageTimelineEntry[];
}

export interface ChannelStorageBreakdown {
  channelName: string;
  displayName: string;
  fileCount: number;
  sizeGB: number;
  profileImageUrl?: string;
}

export interface GameStorageBreakdown {
  gameName: string;
  fileCount: number;
  sizeGB: number;
  boxArtUrl?: string;
}

export interface StorageTimelineEntry {
  date: string;
  totalSizeGB: number;
  downloadedSizeGB: number;
  files: number;
}

export interface VerificationStats {
  totalFiles: number;
  verifiedFiles: number;
  corruptedFiles: number;
  pendingFiles: number;
  lastVerificationDate: string | null;
  verificationProgress: number;
  estimatedTimeRemaining: number;
  isRunning: boolean;
}

export interface FileItem {
  id: string;
  vodId: string;
  filename: string;
  sizeGB: number;
  status: 'downloaded' | 'missing' | 'corrupted' | 'downloading' | 'queued';
  isProtected: boolean;
  lastVerified: string | null;
  channelName: string;
  channelDisplayName: string;
  gameName: string;
  duration: number;
  createdAt: string;
  downloadedAt: string | null;
  quality: string;
  thumbnailUrl?: string; // Add thumbnail URL support
  filePath?: string;
  checksum?: string;
}

export interface CleanupAnalysis {
  eligibleFiles: FileItem[];
  totalSpaceSavingGB: number;
  oldestFileAge: number;
  retentionPolicyViolations: number;
  byRetentionPolicy: number;
  byStorageLimit: number;
  byCorruption: number;
}

export interface CleanupResult {
  deletedFiles: number;
  spaceSavedGB: number;
  errors: string[];
  summary: {
    byRetentionPolicy: number;
    byStorageLimit: number;
    byCorruption: number;
  };
}

export interface VerificationResult {
  vodId: string;
  filename: string;
  isValid: boolean;
  checksum?: string;
  error?: string;
  verifiedAt: string;
}

export interface BulkVerificationResult {
  totalFiles: number;
  verifiedFiles: number;
  corruptedFiles: number;
  errors: string[];
  results: VerificationResult[];
}

export interface FileState {
  vodId: string;
  exists: boolean;
  sizeBytes: number;
  lastModified: string;
  checksum?: string;
  isProtected: boolean;
  path: string;
}

export interface StorageConfig {
  retentionDays: number;
  maxStorageGB: number;
  autoCleanup: boolean;
  cleanupFrequency: 'daily' | 'weekly' | 'monthly' | 'never';
  verificationMethod: 'checksum' | 'quick' | 'deep';
  autoVerification: boolean;
  verificationFrequency: 'daily' | 'weekly' | 'monthly' | 'never';
  concurrentVerifications: number;
  preserveProtectedFiles: boolean;
}

export interface CleanupHistory {
  id: string;
  executedAt: string;
  deletedFiles: number;
  spaceSavedGB: number;
  triggerType: 'manual' | 'scheduled' | 'storage-limit';
  errors: string[];
}

export interface VerificationHistory {
  id: string;
  startedAt: string;
  completedAt: string | null;
  totalFiles: number;
  verifiedFiles: number;
  corruptedFiles: number;
  errors: string[];
  triggerType: 'manual' | 'scheduled' | 'on-download';
}

// API request/response types

export interface BulkProtectRequest {
  vodIds: string[];
}

export interface BulkProtectResponse {
  protectedCount: number;
  errors: Array<{
    vodId: string;
    error: string;
  }>;
}

export interface RedownloadRequest {
  vodId: string;
  priority?: 'low' | 'normal' | 'high';
  quality?: string;
}

export interface RedownloadResponse {
  success: boolean;
  queuePosition?: number;
  estimatedStartTime?: string;
}
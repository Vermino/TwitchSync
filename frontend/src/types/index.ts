// Filepath: frontend/src/types/index.ts

// Re-export specific types from api.ts to avoid conflicts
export type {
  ApiResponse,
  PaginatedResponse,
  ChannelListResponse,
  GameListResponse,
  TwitchChannelSearchResult,
  TwitchGameSearchResult,
  ApiError,
  WebSocketEvents,
  DashboardStats
} from './api';

// Re-export core entity types from task.ts
export type {
  Task,
  TaskType,
  TaskStatus,
  TaskPriority,
  ScheduleType,
  TaskProgress,
  TaskConfig,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskDetails,
  TaskStorage,
  Channel,
  Game
} from './task';

// Re-export settings types
export type {
  SystemSettings,
  StorageStats,
  UserPreferences,
  NotificationSettings
} from './settings';

// Re-export discovery types
export type {
  DiscoveryFeedResponse,
  DiscoveryPreferences,
  DiscoveryStats,
  ChannelRecommendation,
  GameRecommendation,
  RisingChannel,
  StreamPremiereEvent,
  TrackPremiereResponse,
  TrendingCategory,
  UpdatePreferencesResponse
} from './discovery';

// Re-export queue types
export type {
  QueueItem,
  QueueStats,
  DownloadHistoryItem,
  BulkAction,
  QueueFilters,
  QueueSortOptions,
  QueueStatus,
  QueuePriority
} from './queue';

// Re-export storage types
export type {
  StorageAnalytics,
  ChannelStorageBreakdown,
  GameStorageBreakdown,
  StorageTimelineEntry,
  VerificationStats,
  FileItem,
  CleanupAnalysis,
  CleanupResult,
  VerificationResult,
  BulkVerificationResult,
  FileState,
  StorageConfig,
  CleanupHistory,
  VerificationHistory,
  BulkProtectRequest,
  BulkProtectResponse,
  RedownloadRequest,
  RedownloadResponse
} from './storage';

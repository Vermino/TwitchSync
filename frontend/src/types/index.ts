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

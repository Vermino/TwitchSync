// Filepath: backend/src/routes/tasks/types.ts

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  task_type: 'channel' | 'game' | 'combined';
  channel_ids: number[];
  game_ids: number[];
  schedule_type: 'interval' | 'cron' | 'manual';
  schedule_value: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete: boolean;
  is_active: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: Date;
  updated_at: Date;
  monitoring_status?: string;
  monitoring_enabled?: boolean;
}

export interface TaskOperationsInterface {
  getAllTasks(userId: number): Promise<Task[]>;
  getTaskById(taskId: number, userId: number): Promise<Task>;
  createTask(userId: number, data: CreateTaskRequest): Promise<Task>;
  updateTask(taskId: number, userId: number, data: UpdateTaskRequest): Promise<Task>;
  deleteTask(taskId: number, userId: number): Promise<boolean>;
  toggleTaskState(taskId: number, userId: number, active: boolean): Promise<Task>;
  getTaskHistory(taskId: number, userId: number, limit?: number): Promise<any[]>;
  getTaskManagerDetails(): Promise<any>;
  batchUpdateTasks(userId: number, data: BatchUpdateRequest): Promise<Task[]>;
  batchDeleteTasks(userId: number, taskIds: number[]): Promise<boolean>;
}

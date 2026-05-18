// Filepath: backend/src/services/websocketService.ts

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';

interface DownloadProgress {
  vodId: number;
  taskId: number;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentSegment?: number;
  totalSegments?: number;
  speed?: number;
  eta?: number;
}

interface TaskProgress {
  taskId: number;
  status: string;
  message: string;
  progress: number;
  completedItems: number;
  totalItems: number;
}

export class WebSocketService {
  private static instance: WebSocketService | null = null;
  private io: SocketIOServer | null = null;
  private authenticatedSockets: Map<string, number> = new Map(); // socketId -> userId

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public initialize(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'development'
          ? ['http://localhost:3000', 'http://127.0.0.1:3000']
          : process.env.FRONTEND_URL,
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupEventHandlers();
    logger.info('WebSocket service initialized');
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);

      socket.on('authenticate', (data: { userId: number, token: string }) => {
        // Basic authentication - in production, verify the JWT token
        if (data.userId && data.token) {
          this.authenticatedSockets.set(socket.id, data.userId);
          socket.join(`user_${data.userId}`);
          logger.info(`User ${data.userId} authenticated on socket ${socket.id}`);
          
          socket.emit('authenticated', { success: true });
        } else {
          socket.emit('authentication_failed', { error: 'Invalid credentials' });
        }
      });

      socket.on('join_task', (taskId: number) => {
        const userId = this.authenticatedSockets.get(socket.id);
        if (userId) {
          socket.join(`task_${taskId}`);
          logger.info(`User ${userId} joined task ${taskId} room`);
        }
      });

      socket.on('leave_task', (taskId: number) => {
        socket.leave(`task_${taskId}`);
        logger.info(`Socket ${socket.id} left task ${taskId} room`);
      });

      socket.on('disconnect', () => {
        const userId = this.authenticatedSockets.get(socket.id);
        this.authenticatedSockets.delete(socket.id);
        logger.info(`Client disconnected: ${socket.id} (user: ${userId})`);
      });
    });
  }

  // Emit download progress updates
  public emitDownloadProgress(progress: DownloadProgress): void {
    if (!this.io) return;

    // Emit to all users in the task room
    this.io.to(`task_${progress.taskId}`).emit('download_progress', progress);
    
    logger.debug(`Emitted download progress for VOD ${progress.vodId}: ${progress.progress}%`);
  }

  // Emit download status changes
  public emitDownloadStatusChange(vodId: number, taskId: number, status: string, progress?: number): void {
    if (!this.io) return;

    const update = {
      vodId,
      taskId,
      status,
      progress: progress || 0,
      timestamp: new Date().toISOString()
    };

    this.io.to(`task_${taskId}`).emit('download_status_change', update);
    
    logger.info(`Emitted status change for VOD ${vodId}: ${status}`);
  }

  // Emit task progress updates
  public emitTaskProgress(progress: TaskProgress): void {
    if (!this.io) return;

    this.io.to(`task_${progress.taskId}`).emit('task_progress', progress);
    
    logger.debug(`Emitted task progress for task ${progress.taskId}: ${progress.progress}%`);
  }

  // Emit queue updates
  public emitQueueUpdate(userId: number, queueData: any): void {
    if (!this.io) return;

    this.io.to(`user_${userId}`).emit('queue_updated', queueData);
    
    logger.debug(`Emitted queue update for user ${userId}`);
  }

  // Get connected users count
  public getConnectedUsersCount(): number {
    return this.authenticatedSockets.size;
  }

  // Check if user is connected
  public isUserConnected(userId: number): boolean {
    return Array.from(this.authenticatedSockets.values()).includes(userId);
  }

  // Broadcast system message
  public broadcastSystemMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    if (!this.io) return;

    this.io.emit('system_message', {
      message,
      level,
      timestamp: new Date().toISOString()
    });
  }

  public getIO(): SocketIOServer | null {
    return this.io;
  }
}

export default WebSocketService;
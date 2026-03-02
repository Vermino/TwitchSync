// Filepath: frontend/src/services/websocketService.ts

import { io, Socket } from 'socket.io-client';

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

interface DownloadStatusChange {
  vodId: number;
  taskId: number;
  status: string;
  progress: number;
  timestamp: string;
}

interface TaskProgress {
  taskId: number;
  status: string;
  message: string;
  progress: number;
  completedItems: number;
  totalItems: number;
}

type WebSocketEventHandler = (data: any) => void;

export class WebSocketService {
  private static instance: WebSocketService | null = null;
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;
  private eventHandlers: Map<string, WebSocketEventHandler[]> = new Map();

  private constructor() { }

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public connect(token: string, userId: number): void {
    const serverUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3501';

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      auth: {
        token: token
      }
    });

    this.setupEventHandlers();

    // Authenticate after connection
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Authenticate with server
      this.socket?.emit('authenticate', { userId, token });
    });

    this.socket.on('authenticated', (data) => {
      this.emitEvent('authenticated', data);
    });

    this.socket.on('authentication_failed', (data) => {
      console.error('WebSocket authentication failed:', data);
      this.emitEvent('authentication_failed', data);
    });

    this.socket.on('disconnect', (_reason) => {
      this.isConnected = false;
      this.attemptReconnect();
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.isConnected = false;
      this.attemptReconnect();
    });
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Download progress updates
    this.socket.on('download_progress', (data: DownloadProgress) => {
      this.emitEvent('download_progress', data);
    });

    // Download status changes
    this.socket.on('download_status_change', (data: DownloadStatusChange) => {
      this.emitEvent('download_status_change', data);
    });

    // Task progress updates
    this.socket.on('task_progress', (data: TaskProgress) => {
      this.emitEvent('task_progress', data);
    });

    // Queue updates
    this.socket.on('queue_updated', (data: any) => {
      this.emitEvent('queue_updated', data);
    });

    // System messages
    this.socket.on('system_message', (data: any) => {
      this.emitEvent('system_message', data);
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emitEvent('connection_failed', { reason: 'Max attempts reached' });
      return;
    }

    setTimeout(() => {
      this.reconnectAttempts++;

      if (this.socket) {
        this.socket.connect();
      }
    }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts)); // Exponential backoff
  }

  public joinTask(taskId: number): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('join_task', taskId);
    }
  }

  public leaveTask(taskId: number): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('leave_task', taskId);
    }
  }

  public addEventListener(event: string, handler: WebSocketEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  public removeEventListener(event: string, handler: WebSocketEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emitEvent(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
    this.eventHandlers.clear();
  }

  public isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  public getConnectionStatus(): { connected: boolean; attempts: number; maxAttempts: number } {
    return {
      connected: this.isConnected,
      attempts: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts
    };
  }
}

export default WebSocketService;
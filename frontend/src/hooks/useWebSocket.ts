// Filepath: frontend/src/hooks/useWebSocket.ts

import { useEffect, useRef, useCallback } from 'react';
import { WebSocketService } from '@/services/websocketService';
import { useAuth } from '@/contexts/AuthContext';

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

interface UseWebSocketOptions {
  onDownloadProgress?: (data: DownloadProgress) => void;
  onDownloadStatusChange?: (data: DownloadStatusChange) => void;
  onTaskProgress?: (data: TaskProgress) => void;
  onQueueUpdated?: (data: any) => void;
  onSystemMessage?: (data: any) => void;
  onConnectionStatusChange?: (connected: boolean) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { user, token } = useAuth();
  const webSocketService = useRef<WebSocketService>(WebSocketService.getInstance());
  const isInitialized = useRef(false);

  const {
    onDownloadProgress,
    onDownloadStatusChange,
    onTaskProgress,
    onQueueUpdated,
    onSystemMessage,
    onConnectionStatusChange
  } = options;

  // Initialize WebSocket connection
  useEffect(() => {
    if (user && token && !isInitialized.current) {
      console.log('Initializing WebSocket connection...');
      webSocketService.current.connect(token, user.id);
      isInitialized.current = true;

      // Set up event handlers
      const handleAuthenticated = (data: any) => {
        console.log('WebSocket authenticated:', data);
        onConnectionStatusChange?.(true);
      };

      const handleAuthenticationFailed = (data: any) => {
        console.error('WebSocket authentication failed:', data);
        onConnectionStatusChange?.(false);
      };

      const handleConnectionFailed = (data: any) => {
        console.error('WebSocket connection failed:', data);
        onConnectionStatusChange?.(false);
      };

      webSocketService.current.addEventListener('authenticated', handleAuthenticated);
      webSocketService.current.addEventListener('authentication_failed', handleAuthenticationFailed);
      webSocketService.current.addEventListener('connection_failed', handleConnectionFailed);

      return () => {
        webSocketService.current.removeEventListener('authenticated', handleAuthenticated);
        webSocketService.current.removeEventListener('authentication_failed', handleAuthenticationFailed);
        webSocketService.current.removeEventListener('connection_failed', handleConnectionFailed);
      };
    }
  }, [user, token, onConnectionStatusChange]);

  // Set up download progress handler
  useEffect(() => {
    if (onDownloadProgress) {
      const handleDownloadProgress = (data: DownloadProgress) => {
        onDownloadProgress(data);
      };

      webSocketService.current.addEventListener('download_progress', handleDownloadProgress);
      
      return () => {
        webSocketService.current.removeEventListener('download_progress', handleDownloadProgress);
      };
    }
  }, [onDownloadProgress]);

  // Set up download status change handler
  useEffect(() => {
    if (onDownloadStatusChange) {
      const handleDownloadStatusChange = (data: DownloadStatusChange) => {
        onDownloadStatusChange(data);
      };

      webSocketService.current.addEventListener('download_status_change', handleDownloadStatusChange);
      
      return () => {
        webSocketService.current.removeEventListener('download_status_change', handleDownloadStatusChange);
      };
    }
  }, [onDownloadStatusChange]);

  // Set up task progress handler
  useEffect(() => {
    if (onTaskProgress) {
      const handleTaskProgress = (data: TaskProgress) => {
        onTaskProgress(data);
      };

      webSocketService.current.addEventListener('task_progress', handleTaskProgress);
      
      return () => {
        webSocketService.current.removeEventListener('task_progress', handleTaskProgress);
      };
    }
  }, [onTaskProgress]);

  // Set up queue update handler
  useEffect(() => {
    if (onQueueUpdated) {
      const handleQueueUpdated = (data: any) => {
        onQueueUpdated(data);
      };

      webSocketService.current.addEventListener('queue_updated', handleQueueUpdated);
      
      return () => {
        webSocketService.current.removeEventListener('queue_updated', handleQueueUpdated);
      };
    }
  }, [onQueueUpdated]);

  // Set up system message handler
  useEffect(() => {
    if (onSystemMessage) {
      const handleSystemMessage = (data: any) => {
        onSystemMessage(data);
      };

      webSocketService.current.addEventListener('system_message', handleSystemMessage);
      
      return () => {
        webSocketService.current.removeEventListener('system_message', handleSystemMessage);
      };
    }
  }, [onSystemMessage]);

  // Join task room
  const joinTask = useCallback((taskId: number) => {
    webSocketService.current.joinTask(taskId);
  }, []);

  // Leave task room  
  const leaveTask = useCallback((taskId: number) => {
    webSocketService.current.leaveTask(taskId);
  }, []);

  // Get connection status
  const getConnectionStatus = useCallback(() => {
    return webSocketService.current.getConnectionStatus();
  }, []);

  // Check if connected
  const isConnected = useCallback(() => {
    return webSocketService.current.isSocketConnected();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInitialized.current) {
        webSocketService.current.disconnect();
        isInitialized.current = false;
      }
    };
  }, []);

  return {
    joinTask,
    leaveTask,
    getConnectionStatus,
    isConnected
  };
}
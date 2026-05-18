// Filepath: frontend/src/components/RealTimeProgress.tsx

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, Download, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useToast } from '@/components/ui/use-toast';

interface DownloadItem {
  vodId: number;
  taskId: number;
  title?: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentSegment?: number;
  totalSegments?: number;
  speed?: number;
  eta?: number;
  lastUpdate: string;
}

interface RealTimeProgressProps {
  taskId?: number;
  className?: string;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'downloading':
      return <Download className="w-4 h-4 text-blue-500 animate-bounce" />;
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'cancelled':
      return <XCircle className="w-4 h-4 text-gray-500" />;
    default:
      return <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'downloading':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'completed':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'failed':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'cancelled':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  }
};

const formatSpeed = (speed?: number): string => {
  if (!speed || speed === 0) return 'N/A';
  if (speed < 1024) return `${speed.toFixed(1)} B/s`;
  if (speed < 1024 * 1024) return `${(speed / 1024).toFixed(1)} KB/s`;
  return `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
};

const formatETA = (eta?: number): string => {
  if (!eta || eta === 0) return 'N/A';
  if (eta < 60) return `${Math.round(eta)}s`;
  if (eta < 3600) return `${Math.round(eta / 60)}m`;
  return `${Math.round(eta / 3600)}h`;
};

export default function RealTimeProgress({ taskId, className }: RealTimeProgressProps) {
  const [downloads, setDownloads] = useState<Map<number, DownloadItem>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();

  const { joinTask, leaveTask, getConnectionStatus } = useWebSocket({
    onDownloadProgress: (data) => {
      setDownloads(prev => {
        const newMap = new Map(prev);
        newMap.set(data.vodId, {
          vodId: data.vodId,
          taskId: data.taskId,
          status: data.status,
          progress: data.progress,
          currentSegment: data.currentSegment,
          totalSegments: data.totalSegments,
          speed: data.speed,
          eta: data.eta,
          lastUpdate: new Date().toISOString()
        });
        return newMap;
      });
    },
    onDownloadStatusChange: (data) => {
      setDownloads(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(data.vodId);
        newMap.set(data.vodId, {
          ...existing,
          vodId: data.vodId,
          taskId: data.taskId,
          status: data.status as any,
          progress: data.progress,
          lastUpdate: data.timestamp
        });
        return newMap;
      });

      // Show toast for status changes
      if (data.status === 'completed') {
        toast({
          title: "Download Completed",
          description: `VOD ${data.vodId} has finished downloading`,
        });
      } else if (data.status === 'failed') {
        toast({
          title: "Download Failed",
          description: `VOD ${data.vodId} download failed`,
          variant: "destructive",
        });
      }
    },
    onConnectionStatusChange: (connected) => {
      setIsConnected(connected);
      if (connected) {
        toast({
          title: "Connected",
          description: "Real-time updates are now active",
        });
      } else {
        toast({
          title: "Connection Lost",
          description: "Real-time updates are unavailable",
          variant: "destructive",
        });
      }
    }
  });

  // Join task room if taskId is provided
  useEffect(() => {
    if (taskId && isConnected) {
      joinTask(taskId);
      return () => leaveTask(taskId);
    }
  }, [taskId, isConnected, joinTask, leaveTask]);

  // Remove completed/failed downloads after some time
  useEffect(() => {
    const cleanup = setInterval(() => {
      setDownloads(prev => {
        const newMap = new Map(prev);
        const now = new Date().getTime();
        
        for (const [vodId, download] of newMap.entries()) {
          const lastUpdate = new Date(download.lastUpdate).getTime();
          const age = now - lastUpdate;
          
          // Remove completed/failed downloads after 30 seconds
          if ((download.status === 'completed' || download.status === 'failed') && age > 30000) {
            newMap.delete(vodId);
          }
        }
        
        return newMap;
      });
    }, 5000);

    return () => clearInterval(cleanup);
  }, []);

  const activeDownloads = Array.from(downloads.values()).filter(d => 
    d.status === 'downloading' || d.status === 'queued'
  );
  const recentDownloads = Array.from(downloads.values()).filter(d => 
    d.status === 'completed' || d.status === 'failed'
  );

  if (!isConnected) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            Real-time Progress (Disconnected)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            Real-time updates are not available. Connection status: {getConnectionStatus().connected ? 'Connected' : 'Disconnected'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          Real-time Progress
          {activeDownloads.length > 0 && (
            <Badge variant="secondary">
              {activeDownloads.length} active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeDownloads.length === 0 && recentDownloads.length === 0 ? (
          <p className="text-sm text-gray-500">No active downloads</p>
        ) : (
          <>
            {/* Active Downloads */}
            {activeDownloads.map((download) => (
              <div key={download.vodId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(download.status)}
                    <span className="text-sm font-medium">
                      VOD {download.vodId}
                      {download.title && ` - ${download.title.slice(0, 50)}...`}
                    </span>
                    <Badge className={getStatusColor(download.status)}>
                      {download.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {download.speed && (
                      <span>{formatSpeed(download.speed)}</span>
                    )}
                    {download.eta && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatETA(download.eta)}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="space-y-1">
                  <Progress value={download.progress} className="h-2" />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{download.progress.toFixed(1)}% complete</span>
                    {download.currentSegment && download.totalSegments && (
                      <span>
                        Segment {download.currentSegment}/{download.totalSegments}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {/* Recent Downloads */}
            {recentDownloads.map((download) => (
              <div key={download.vodId} className="flex items-center justify-between py-2 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  {getStatusIcon(download.status)}
                  <span className="text-sm">
                    VOD {download.vodId}
                  </span>
                  <Badge className={getStatusColor(download.status)}>
                    {download.status}
                  </Badge>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(download.lastUpdate).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
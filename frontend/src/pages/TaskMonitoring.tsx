import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Activity, HardDrive, Download, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  TaskMonitoringClient,
  type TaskAlert,
  type TaskStats,
} from '@/lib/api/taskMonitoringClient';
import { Button } from '@/components/ui/button';

const taskMonitoringClient = new TaskMonitoringClient();

const EMPTY_STATS: TaskStats = {
  successRate: 0,
  errorRate: 0,
  storageUsedGB: 0,
  storageLimitGB: 0,
  activeDownloads: 0,
  maxConcurrent: 0,
  totalVods: 0,
  completedVods: 0,
  failedVods: 0,
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function TaskMonitoring() {
  const { taskId } = useParams<{ taskId: string }>();

  const statsQuery = useQuery({
    queryKey: ['taskMonitoringStats', taskId],
    queryFn: () => taskMonitoringClient.getTaskStats(Number(taskId)),
    enabled: Boolean(taskId),
    refetchInterval: 30000,
  });

  const performanceQuery = useQuery({
    queryKey: ['taskMonitoringPerformance', taskId],
    queryFn: () => taskMonitoringClient.getTaskPerformance(Number(taskId)),
    enabled: Boolean(taskId),
    refetchInterval: 30000,
  });

  const alertsQuery = useQuery({
    queryKey: ['taskMonitoringAlerts', taskId],
    queryFn: () => taskMonitoringClient.getTaskAlerts(Number(taskId)),
    enabled: Boolean(taskId),
    refetchInterval: 30000,
  });

  const taskStats = statsQuery.data ?? EMPTY_STATS;
  const performanceData = performanceQuery.data ?? [];
  const alerts = alertsQuery.data ?? [];
  const isLoading = statsQuery.isLoading || performanceQuery.isLoading || alertsQuery.isLoading;
  const error = statsQuery.error || performanceQuery.error || alertsQuery.error;

  const health = useMemo(() => {
    if (taskStats.errorRate >= 20) {
      return { label: 'CRITICAL', variant: 'destructive' as const };
    }
    if (taskStats.errorRate >= 10) {
      return { label: 'WARNING', variant: 'secondary' as const };
    }
    if (taskStats.totalVods === 0) {
      return { label: 'IDLE', variant: 'outline' as const };
    }
    return { label: 'HEALTHY', variant: 'default' as const };
  }, [taskStats.errorRate, taskStats.totalVods]);

  const storageProgress = taskStats.storageLimitGB > 0
    ? Math.min((taskStats.storageUsedGB / taskStats.storageLimitGB) * 100, 100)
    : 0;

  const downloadProgress = taskStats.maxConcurrent > 0
    ? Math.min((taskStats.activeDownloads / taskStats.maxConcurrent) * 100, 100)
    : 0;

  if (!taskId) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Missing Task</AlertTitle>
          <AlertDescription>No task ID was provided for monitoring.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Monitoring Unavailable</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to load task monitoring data.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="task-monitoring-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Task Monitoring</h1>
          <p className="text-muted-foreground">Task #{taskId} performance and runtime state</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={health.variant} data-testid="task-monitoring-health">
            {health.label}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void statsQuery.refetch();
              void performanceQuery.refetch();
              void alertsQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4" />
                  Success Rate
                </CardTitle>
                <CardDescription>Completed vs total VODs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{taskStats.successRate.toFixed(1)}%</div>
                <Progress value={taskStats.successRate} className="mt-3" />
                <div className="mt-2 text-sm text-muted-foreground">
                  {taskStats.completedVods} completed / {taskStats.totalVods} total
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4" />
                  Error Rate
                </CardTitle>
                <CardDescription>Failed VOD ratio</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{taskStats.errorRate.toFixed(1)}%</div>
                <Progress value={taskStats.errorRate} className="mt-3" />
                <div className="mt-2 text-sm text-muted-foreground">
                  {taskStats.failedVods} failed VODs
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <HardDrive className="h-4 w-4" />
                  Storage Usage
                </CardTitle>
                <CardDescription>Completed download footprint</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {taskStats.storageUsedGB.toFixed(1)} GB
                </div>
                <Progress value={storageProgress} className="mt-3" />
                <div className="mt-2 text-sm text-muted-foreground">
                  Limit: {taskStats.storageLimitGB || 0} GB
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Download className="h-4 w-4" />
                  Active Downloads
                </CardTitle>
                <CardDescription>Current concurrency</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {taskStats.activeDownloads} / {taskStats.maxConcurrent}
                </div>
                <Progress value={downloadProgress} className="mt-3" />
                <div className="mt-2 text-sm text-muted-foreground">
                  In progress right now
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <CardDescription>Recent task performance over time</CardDescription>
            </CardHeader>
            <CardContent>
              {performanceData.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  No performance data has been recorded yet.
                </div>
              ) : (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={performanceData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} />
                      <YAxis />
                      <Tooltip
                        labelFormatter={(value) => formatTimestamp(String(value))}
                      />
                      <Line
                        type="monotone"
                        dataKey="successRate"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                        name="Success Rate"
                      />
                      <Line
                        type="monotone"
                        dataKey="downloadSpeed"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        name="Download Speed"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          {alerts.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No active alerts for this task.
              </CardContent>
            </Card>
          ) : (
            alerts.map((alert: TaskAlert) => (
              <Alert key={alert.id} variant={alert.type === 'error' ? 'destructive' : 'default'}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {alert.type === 'error' ? 'Error' : alert.type === 'warning' ? 'Warning' : 'Information'}
                </AlertTitle>
                <AlertDescription>{alert.message}</AlertDescription>
              </Alert>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

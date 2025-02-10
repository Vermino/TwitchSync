import { useParams } from 'react-router-dom';
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
import { AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {useEffect, useState} from "react";

const TaskMonitoring = () => {
  const { taskId } = useParams();
  const [taskStats, setTaskStats] = useState(null);
  const [performanceData, setPerformanceData] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    // Fetch initial data
    fetchTaskData();
    // Refresh data every 30 seconds
    const interval = setInterval(fetchTaskData, 30000);
    return () => clearInterval(interval);
  }, [taskId]);

const fetchTaskData = async () => {
    try {
        const statsResponse = await fetch(`/api/tasks/${taskId}/stats`);
        if (!statsResponse.ok) throw new Error('Failed to fetch stats');
        const performanceResponse = await fetch(`/api/tasks/${taskId}/performance`);
        if (!performanceResponse.ok) throw new Error('Failed to fetch performance data');
        const alertsResponse = await fetch(`/api/tasks/${taskId}/alerts`);
        if (!alertsResponse.ok) throw new Error('Failed to fetch alerts');

        const stats = await statsResponse.json();
        const performance = await performanceResponse.json();
        const alerts = await alertsResponse.json();

        setTaskStats(stats);
        setPerformanceData(performance);
        setAlerts(alerts);
    } catch (error) {
        console.error('Error fetching task data:', error);
        // Add a state for showing errors to the user
        setAlerts([{ id: 'fetch-error', type: 'error', message: error.message }]);
    } finally {
        setLoading(false);
    }
};

  const getHealthStatus = () => {
    if (!taskStats) return 'unknown';
    if (taskStats.errorRate > 20) return 'critical';
    if (taskStats.errorRate > 10) return 'warning';
    return 'healthy';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Task Monitoring</h1>
        <Badge variant={getHealthStatus() === 'healthy' ? 'success' : 'destructive'}>
          {getHealthStatus().toUpperCase()}
        </Badge>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Success Rate</CardTitle>
                <CardDescription>Overall task success rate</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {taskStats?.successRate.toFixed(1)}%
                </div>
                <Progress
                  value={taskStats?.successRate || 0}
                  className="mt-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Storage Usage</CardTitle>
                <CardDescription>Current storage utilization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {taskStats?.storageUsedGB.toFixed(1)} GB / {taskStats?.storageLimitGB} GB
                </div>
                <Progress
                  value={(taskStats?.storageUsedGB / taskStats?.storageLimitGB) * 100 || 0}
                  className="mt-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Downloads</CardTitle>
                <CardDescription>Current download status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {taskStats?.activeDownloads || 0} / {taskStats?.maxConcurrent || 3}
                </div>
                <Progress
                  value={(taskStats?.activeDownloads / taskStats?.maxConcurrent) * 100 || 0}
                  className="mt-2"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <CardDescription>Task performance over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="successRate"
                      stroke="#10b981"
                      name="Success Rate"
                    />
                    <Line
                      type="monotone"
                      dataKey="downloadSpeed"
                      stroke="#3b82f6"
                      name="Download Speed"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          {alerts.map((alert) => (
            <Alert key={alert.id} variant={alert.type}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                {alert.type === 'error' ? 'Error' :
                 alert.type === 'warning' ? 'Warning' : 'Information'}
              </AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TaskMonitoring;

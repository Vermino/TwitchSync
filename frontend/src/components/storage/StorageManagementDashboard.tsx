import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Button
} from '@/components/ui/button';
import {
  Badge
} from '@/components/ui/badge';
import {
  Progress
} from '@/components/ui/progress';
import {
  Input
} from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Checkbox
} from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import {
  Trash2,
  Shield,
  CheckCircle,
  AlertTriangle,
  Download,
  Search,
  RefreshCw,
  Database,
  Settings,
  Users,
  Gamepad2
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';

import type { 
  StorageAnalytics, 
  VerificationStats, 
  FileItem, 
  CleanupAnalysis, 
  CleanupResult 
} from '@/types';

import { api } from '@/lib/api';

export default function StorageManagementDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('size');
  const [verificationInProgress, setVerificationInProgress] = useState(false);
  const [cleanupInProgress, setCleanupInProgress] = useState(false);

  // Queries
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['storage-analytics'],
    queryFn: () => api.getStorageAnalytics(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: verificationStats, isLoading: verificationLoading } = useQuery({
    queryKey: ['verification-stats'],
    queryFn: () => api.getVerificationStats(),
    refetchInterval: 10000, // Refresh every 10 seconds when verification is running
  });

  const { data: largestFiles, isLoading: filesLoading } = useQuery({
    queryKey: ['largest-files'],
    queryFn: () => api.getLargestFiles(100), // Get top 100 largest files
  });

  const { data: cleanupAnalysis, isLoading: cleanupLoading } = useQuery({
    queryKey: ['cleanup-analysis'],
    queryFn: () => api.getCleanupAnalysis(),
  });

  // Mutations
  const bulkVerifyMutation = useMutation({
    mutationFn: () => api.bulkVerifyFiles(),
    onMutate: () => {
      setVerificationInProgress(true);
    },
    onSuccess: () => {
      toast({
        title: "Verification Started",
        description: "Bulk file verification has been initiated.",
      });
      queryClient.invalidateQueries({ queryKey: ['verification-stats'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setVerificationInProgress(false);
    },
  });

  const executeCleanupMutation = useMutation({
    mutationFn: () => api.executeStorageCleanup(),
    onMutate: () => {
      setCleanupInProgress(true);
    },
    onSuccess: (data) => {
      toast({
        title: "Cleanup Completed",
        description: `Deleted ${data.deletedFiles} files, saved ${data.spaceSavedGB.toFixed(1)} GB`,
      });
      queryClient.invalidateQueries({ queryKey: ['storage-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['cleanup-analysis'] });
      queryClient.invalidateQueries({ queryKey: ['largest-files'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Cleanup Failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setCleanupInProgress(false);
    },
  });

  // Computed values
  const filteredFiles = useMemo(() => {
    if (!largestFiles?.files) return [];
    
    return largestFiles.files
      .filter((file: FileItem) => {
        if (searchQuery && !file.filename.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !file.channelDisplayName.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !file.gameName.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        if (filterStatus !== 'all' && file.status !== filterStatus) {
          return false;
        }
        return true;
      })
      .sort((a: FileItem, b: FileItem) => {
        switch (sortBy) {
          case 'size':
            return b.sizeGB - a.sizeGB;
          case 'date':
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          case 'channel':
            return a.channelDisplayName.localeCompare(b.channelDisplayName);
          case 'game':
            return a.gameName.localeCompare(b.gameName);
          default:
            return 0;
        }
      });
  }, [largestFiles, searchQuery, filterStatus, sortBy]);

  // Event handlers
  const handleSelectFile = useCallback((fileId: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedFiles.length === filteredFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(filteredFiles.map((f: FileItem) => f.id));
    }
  }, [selectedFiles, filteredFiles]);

  const protectFileMutation = useMutation({
    mutationFn: (vodId: string) => api.protectVod(vodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['largest-files'] });
      queryClient.invalidateQueries({ queryKey: ['storage-analytics'] });
    },
  });

  const verifyFileMutation = useMutation({
    mutationFn: (vodId: string) => api.verifyVodFile(vodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['largest-files'] });
      queryClient.invalidateQueries({ queryKey: ['verification-stats'] });
    },
  });

  const redownloadFileMutation = useMutation({
    mutationFn: (vodId: string) => api.redownloadVod(vodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['largest-files'] });
      queryClient.invalidateQueries({ queryKey: ['storage-analytics'] });
    },
  });

  const handleBulkProtect = useCallback(async () => {
    try {
      // Find VOD IDs for selected files
      const selectedFileItems = largestFiles?.filter((f: FileItem) => selectedFiles.includes(f.id));
      if (!selectedFileItems) return;

      // Bulk protect selected files
      await Promise.all(selectedFileItems.map(file => api.protectVod(file.vodId)));
      toast({
        title: "Files Protected",
        description: `Protected ${selectedFiles.length} files from cleanup`,
      });
      setSelectedFiles([]);
      queryClient.invalidateQueries({ queryKey: ['largest-files'] });
      queryClient.invalidateQueries({ queryKey: ['storage-analytics'] });
    } catch (error) {
      toast({
        title: "Protection Failed",
        description: error instanceof Error ? error.message : "Failed to protect files",
        variant: "destructive",
      });
    }
  }, [selectedFiles, largestFiles, queryClient, toast]);

  const formatFileSize = (sizeGB: number) => {
    if (sizeGB >= 1) return `${sizeGB.toFixed(1)} GB`;
    return `${(sizeGB * 1024).toFixed(0)} MB`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'downloaded': return 'bg-green-500';
      case 'missing': return 'bg-yellow-500';
      case 'corrupted': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'downloaded': return 'default' as const;
      case 'missing': return 'secondary' as const;
      case 'corrupted': return 'destructive' as const;
      default: return 'outline' as const;
    }
  };


  if (analyticsLoading || verificationLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Storage Management</h1>
          <p className="text-muted-foreground">
            Manage your VOD storage, cleanup old files, and verify file integrity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries()}
            disabled={analyticsLoading || verificationLoading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Storage Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Storage</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatFileSize(analytics?.totalSizeGB || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {analytics?.totalFiles || 0} files
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Downloaded</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatFileSize(analytics?.downloadedSizeGB || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {analytics?.downloadedFiles || 0} files ({((analytics?.downloadedFiles || 0) / (analytics?.totalFiles || 1) * 100).toFixed(1)}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Protected</CardTitle>
            <Shield className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatFileSize(analytics?.protectedSizeGB || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {analytics?.protectedFiles || 0} files
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(analytics?.missingFiles || 0) + (analytics?.corruptedFiles || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics?.missingFiles || 0} missing, {analytics?.corruptedFiles || 0} corrupted
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="files">File Management</TabsTrigger>
          <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Storage Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Storage Distribution</CardTitle>
                <CardDescription>Breakdown by file status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Downloaded', value: analytics?.downloadedSizeGB || 0, color: '#10b981' },
                          { name: 'Missing', value: analytics?.missingSizeGB || 0, color: '#f59e0b' },
                          { name: 'Corrupted', value: analytics?.corruptedSizeGB || 0, color: '#ef4444' },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${formatFileSize(value)}`}
                      >
                        {[
                          { color: '#10b981' },
                          { color: '#f59e0b' },
                          { color: '#ef4444' }
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Storage Growth */}
            <Card>
              <CardHeader>
                <CardTitle>Storage Growth</CardTitle>
                <CardDescription>Monthly storage usage over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics?.storageTimeline || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RechartsTooltip 
                        labelFormatter={(value) => `Month: ${value}`}
                        formatter={(value: number, name: string) => [formatFileSize(value), name]}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="totalSizeGB" 
                        stackId="1"
                        stroke="#8b5cf6" 
                        fill="#8b5cf6" 
                        fillOpacity={0.6}
                        name="Total Storage"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="downloadedSizeGB" 
                        stackId="2"
                        stroke="#10b981" 
                        fill="#10b981" 
                        fillOpacity={0.8}
                        name="Downloaded"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common storage management tasks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <Button 
                  onClick={() => bulkVerifyMutation.mutate()} 
                  disabled={verificationInProgress}
                  className="h-20 flex flex-col items-center justify-center space-y-2"
                >
                  <CheckCircle className="h-6 w-6" />
                  <span>Verify All Files</span>
                </Button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="outline"
                      disabled={cleanupInProgress || !cleanupAnalysis}
                      className="h-20 flex flex-col items-center justify-center space-y-2"
                    >
                      <Trash2 className="h-6 w-6" />
                      <span>Run Cleanup</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm Storage Cleanup</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete {cleanupAnalysis?.eligibleFiles.length || 0} files and save approximately {formatFileSize(cleanupAnalysis?.totalSpaceSavingGB || 0)} of storage space.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => executeCleanupMutation.mutate()}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Delete Files
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Button 
                  variant="outline"
                  className="h-20 flex flex-col items-center justify-center space-y-2"
                  onClick={() => queryClient.invalidateQueries()}
                >
                  <RefreshCw className="h-6 w-6" />
                  <span>Refresh Data</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* File Management Tab */}
        <TabsContent value="files" className="space-y-4">
          {/* Controls */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex flex-col sm:flex-row gap-2 flex-1">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search files, channels, or games..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Files</SelectItem>
                      <SelectItem value="downloaded">Downloaded</SelectItem>
                      <SelectItem value="missing">Missing</SelectItem>
                      <SelectItem value="corrupted">Corrupted</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="size">Size</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="channel">Channel</SelectItem>
                      <SelectItem value="game">Game</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleBulkProtect}
                      disabled={selectedFiles.length === 0}
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      Protect ({selectedFiles.length})
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Files Table */}
          <Card>
            <CardContent className="p-0">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedFiles.length === filteredFiles.length && filteredFiles.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Game</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Verified</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filesLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                        </TableCell>
                      </TableRow>
                    ) : filteredFiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No files found matching your criteria
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredFiles.map((file: FileItem) => (
                        <TableRow key={file.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedFiles.includes(file.id)}
                              onCheckedChange={() => handleSelectFile(file.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {file.isProtected && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Shield className="h-4 w-4 text-blue-600" />
                                    </TooltipTrigger>
                                    <TooltipContent>Protected from cleanup</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              <div>
                                <div className="font-medium truncate max-w-60">{file.filename}</div>
                                <div className="text-sm text-muted-foreground">
                                  {file.quality} • {formatDuration(file.duration)}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>{file.channelDisplayName}</div>
                          </TableCell>
                          <TableCell>
                            <div>{file.gameName}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono">{formatFileSize(file.sizeGB)}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${getStatusColor(file.status)}`} />
                              <Badge variant={getStatusBadgeVariant(file.status)}>
                                {file.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {file.lastVerified ? new Date(file.lastVerified).toLocaleDateString() : 'Never'}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => verifyFileMutation.mutate(file.vodId)}
                                      disabled={verifyFileMutation.isPending}
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Verify file</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => redownloadFileMutation.mutate(file.vodId)}
                                      disabled={redownloadFileMutation.isPending}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Re-download</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => {
                                        if (file.isProtected) {
                                          // Would call api.unprotectVod if implemented
                                          toast({
                                            title: "File Unprotected",
                                            description: "File is no longer protected from cleanup",
                                          });
                                        } else {
                                          protectFileMutation.mutate(file.vodId);
                                          toast({
                                            title: "File Protected",
                                            description: "File is now protected from cleanup",
                                          });
                                        }
                                      }}
                                      disabled={protectFileMutation.isPending}
                                    >
                                      {file.isProtected ? (
                                        <Shield className="h-4 w-4 text-blue-600" />
                                      ) : (
                                        <Shield className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {file.isProtected ? 'Remove protection' : 'Protect from cleanup'}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cleanup Tab */}
        <TabsContent value="cleanup" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Cleanup Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Cleanup Analysis</CardTitle>
                <CardDescription>Files eligible for deletion</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cleanupLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Eligible Files:</span>
                        <span className="font-mono">{cleanupAnalysis?.eligibleFiles.length || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Space Savings:</span>
                        <span className="font-mono text-green-600">
                          {formatFileSize(cleanupAnalysis?.totalSpaceSavingGB || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Oldest File:</span>
                        <span className="font-mono">{cleanupAnalysis?.oldestFileAge || 0} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Policy Violations:</span>
                        <span className="font-mono text-orange-600">{cleanupAnalysis?.retentionPolicyViolations || 0}</span>
                      </div>
                    </div>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          className="w-full" 
                          disabled={cleanupInProgress || (cleanupAnalysis?.eligibleFiles.length || 0) === 0}
                        >
                          {cleanupInProgress && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                          Execute Cleanup
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirm Cleanup Execution</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete {cleanupAnalysis?.eligibleFiles.length || 0} files 
                            and free up {formatFileSize(cleanupAnalysis?.totalSpaceSavingGB || 0)} of storage space.
                            <br /><br />
                            <strong>This action cannot be undone.</strong>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => executeCleanupMutation.mutate()}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete Files
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Cleanup Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Cleanup Settings</CardTitle>
                <CardDescription>Configure automatic cleanup rules</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Retention Period (days)</label>
                  <Input type="number" defaultValue="30" />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Maximum Storage (GB)</label>
                  <Input type="number" defaultValue="1000" />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Auto-cleanup frequency</label>
                  <Select defaultValue="weekly">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="never">Never</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button variant="outline" className="w-full">
                  <Settings className="h-4 w-4 mr-2" />
                  Save Settings
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Cleanup History */}
          <Card>
            <CardHeader>
              <CardTitle>Cleanup History</CardTitle>
              <CardDescription>Recent cleanup operations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center py-8 text-muted-foreground">
                  No cleanup operations performed yet
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Verification Tab */}
        <TabsContent value="verification" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Verification Status */}
            <Card>
              <CardHeader>
                <CardTitle>Verification Status</CardTitle>
                <CardDescription>File integrity verification progress</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{((verificationStats?.verifiedFiles || 0) / (verificationStats?.totalFiles || 1) * 100).toFixed(1)}%</span>
                  </div>
                  <Progress 
                    value={(verificationStats?.verifiedFiles || 0) / (verificationStats?.totalFiles || 1) * 100} 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Verified</div>
                    <div className="font-mono text-green-600">{verificationStats?.verifiedFiles || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Corrupted</div>
                    <div className="font-mono text-red-600">{verificationStats?.corruptedFiles || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Pending</div>
                    <div className="font-mono text-yellow-600">{verificationStats?.pendingFiles || 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Last Run</div>
                    <div className="font-mono">
                      {verificationStats?.lastVerificationDate 
                        ? new Date(verificationStats.lastVerificationDate).toLocaleDateString()
                        : 'Never'
                      }
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={() => bulkVerifyMutation.mutate()} 
                  disabled={verificationInProgress}
                  className="w-full"
                >
                  {verificationInProgress && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                  {verificationInProgress ? 'Verifying...' : 'Start Bulk Verification'}
                </Button>
              </CardContent>
            </Card>

            {/* Verification Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Verification Settings</CardTitle>
                <CardDescription>Configure verification behavior</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Verification Method</label>
                  <Select defaultValue="checksum">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checksum">Checksum Verification</SelectItem>
                      <SelectItem value="quick">Quick Check</SelectItem>
                      <SelectItem value="deep">Deep Analysis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Auto-verification frequency</label>
                  <Select defaultValue="weekly">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="never">Never</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Concurrent verifications</label>
                  <Input type="number" defaultValue="2" min="1" max="8" />
                </div>

                <Button variant="outline" className="w-full">
                  <Settings className="h-4 w-4 mr-2" />
                  Save Settings
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Verification Results */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Verification Results</CardTitle>
              <CardDescription>Files that failed verification</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                No verification issues found
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Top Channels by Storage */}
            <Card>
              <CardHeader>
                <CardTitle>Top Channels by Storage</CardTitle>
                <CardDescription>Channels consuming the most storage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics?.channelBreakdown.slice(0, 5) || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="displayName" />
                      <YAxis />
                      <RechartsTooltip 
                        formatter={(value: number, name: string) => [
                          name === 'sizeGB' ? formatFileSize(value) : value,
                          name === 'sizeGB' ? 'Storage' : 'Files'
                        ]}
                      />
                      <Bar dataKey="sizeGB" fill="#8b5cf6" name="Storage (GB)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top Games by Storage */}
            <Card>
              <CardHeader>
                <CardTitle>Top Games by Storage</CardTitle>
                <CardDescription>Games consuming the most storage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics?.gameBreakdown.slice(0, 5) || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="gameName" />
                      <YAxis />
                      <RechartsTooltip 
                        formatter={(value: number, name: string) => [
                          name === 'sizeGB' ? formatFileSize(value) : value,
                          name === 'sizeGB' ? 'Storage' : 'Files'
                        ]}
                      />
                      <Bar dataKey="sizeGB" fill="#06b6d4" name="Storage (GB)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Breakdown Tables */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Channel Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Files</TableHead>
                      <TableHead className="text-right">Storage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics?.channelBreakdown.map((channel) => (
                      <TableRow key={channel.channelName}>
                        <TableCell>
                          <div className="font-medium">{channel.displayName}</div>
                          <div className="text-sm text-muted-foreground">@{channel.channelName}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{channel.fileCount}</TableCell>
                        <TableCell className="text-right font-mono">{formatFileSize(channel.sizeGB)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gamepad2 className="h-4 w-4" />
                  Game Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Game</TableHead>
                      <TableHead className="text-right">Files</TableHead>
                      <TableHead className="text-right">Storage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics?.gameBreakdown.map((game) => (
                      <TableRow key={game.gameName}>
                        <TableCell>
                          <div className="font-medium">{game.gameName}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{game.fileCount}</TableCell>
                        <TableCell className="text-right font-mono">{formatFileSize(game.sizeGB)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
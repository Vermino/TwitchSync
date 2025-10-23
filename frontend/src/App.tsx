// Filepath: frontend/src/App.tsx

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import CallbackHandler from './components/CallbackHandler';

// Page imports
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Channels from './pages/Channels';
import Games from './pages/Games';
import ContentDiscovery from './pages/ContentDiscovery';
import Settings from './pages/settings';
import TaskManager from './pages/TaskManager';
import TaskMonitoring from './pages/TaskMonitoring';
import StorageManagementDashboard from './components/storage/StorageManagementDashboard';


// Configure React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 1000,
      staleTime: 30000,
      cacheTime: 60000,
      refetchOnWindowFocus: false,
      suspense: false
    }
  }
});

function App() {
  return (
    <TooltipProvider>
      <QueryClientProvider client={queryClient}>
        <Router>
          <AuthProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<CallbackHandler />} />

              {/* Protected routes */}
              <Route element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                {/* Root redirect */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />

                {/* Main routes */}
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/channels" element={<Channels />} />
                <Route path="/games" element={<Games />} />
                <Route path="/discovery" element={<ContentDiscovery />} />
                <Route path="/tasks" element={<TaskManager />} />
                <Route path="/tasks/:taskId/monitoring" element={<TaskMonitoring />} />
                <Route path="/storage" element={<StorageManagementDashboard />} />
                <Route path="/settings" element={<Settings />} />
              </Route>

              {/* Catch all redirect */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AuthProvider>
          <ReactQueryDevtools />
        </Router>
      </QueryClientProvider>
    </TooltipProvider>
  );
}

export default App;

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import ConnectTwitch from './pages/ConnectTwitch';
import Dashboard from './pages/Dashboard';
import Channels from './pages/Channels';
import Games from './pages/Games';
import VODs from './pages/VODs';
import Settings from './pages/Settings';
import CallbackHandler from './components/CallbackHandler';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/connect-twitch" element={<ConnectTwitch />} />
            <Route path="/auth/callback" element={<CallbackHandler />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="channels" element={<Channels />} />
              <Route path="games" element={<Games />} />
              <Route path="vods" element={<VODs />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App;

// frontend/src/components/ProtectedRoute.tsx

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireTwitch?: boolean;
}

export default function ProtectedRoute({ children, requireTwitch = true }: ProtectedRouteProps) {
  const { isAuthenticated, twitchAccount, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireTwitch && !twitchAccount) {
    return <Navigate to="/connect-twitch" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

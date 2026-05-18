// Filepath: frontend/src/components/CallbackHandler.tsx

import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

const CallbackHandler = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const processedCode = useRef<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const handleCallback = async () => {
      if (isProcessing) return;

      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const token = params.get('token');
      const authError = params.get('error');
      const errorDescription = params.get('error_description');
      const state = params.get('state');

      // Handle auth errors
      if (authError) {
        const errorMsg = errorDescription || authError || 'Authentication error';
        logger.error('Auth error:', errorMsg);
        setError(errorMsg);
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      // Handle token-based auth (backend processed the OAuth)
      if (token) {
        // Prevent duplicate processing
        if (processedCode.current === token) {
          return;
        }

        setIsProcessing(true);
        processedCode.current = token;

        try {
          // Store the JWT token and fetch user data
          localStorage.setItem('auth_token', token);
          
          // Verify token by fetching user info
          const response = await fetch('/auth/me', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error('Failed to verify authentication');
          }

          const { user } = await response.json();
          
          logger.info('Authentication successful:', { username: user.username });
          navigate('/dashboard');
          return;
        } catch (err) {
          logger.error('Token verification error:', err);
          setError('Failed to verify authentication token');
          setTimeout(() => navigate('/login'), 3000);
          return;
        } finally {
          setIsProcessing(false);
        }
      }

      // Handle code-based auth (old flow - frontend processes OAuth)
      if (code) {
        // Prevent duplicate processing
        if (processedCode.current === code) {
          return;
        }

        setIsProcessing(true);
        processedCode.current = code;

        try {
          await login(code);
          navigate('/dashboard');
        } catch (err) {
          logger.error('Login error:', err);
          setError(err instanceof Error ? err.message : 'Failed to authenticate with Twitch');
          setTimeout(() => navigate('/login'), 3000);
        } finally {
          setIsProcessing(false);
        }
        return;
      }

      // No code or token provided
      logger.error('No authorization code or token received');
      setError('No authorization information received');
      setTimeout(() => navigate('/login'), 3000);
    };

    handleCallback();
  }, [location, navigate, login, isProcessing]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="text-red-600 mb-4">{error}</div>
          <p className="text-gray-500">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Connecting to Twitch...</p>
      </div>
    </div>
  );
};

export default CallbackHandler;

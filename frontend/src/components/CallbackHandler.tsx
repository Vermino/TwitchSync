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
      const authError = params.get('error');
      const errorDescription = params.get('error_description');
      const state = params.get('state');

      if (authError || !code) {
        const errorMsg = errorDescription || authError || 'No authorization code received';
        logger.error('Auth error:', errorMsg);
        setError(errorMsg);
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

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

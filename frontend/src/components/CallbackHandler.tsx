import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const CallbackHandler = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      if (error) {
        console.error('Auth error:', error, errorDescription);
        navigate('/login');
        return;
      }

      if (!code) {
        console.error('No code received');
        navigate('/login');
        return;
      }

      try {
        await login(code);
      } catch (error) {
        console.error('Login failed:', error);
        navigate('/login');
      }
    };

    handleCallback();
  }, [location, login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        <h2 className="text-xl font-medium text-gray-900">Connecting to Twitch</h2>
        <p className="text-gray-500">Please wait while we complete the authentication...</p>
      </div>
    </div>
  );
};

export default CallbackHandler;

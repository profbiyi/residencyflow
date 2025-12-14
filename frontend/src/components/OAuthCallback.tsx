import React, { useEffect, useState } from 'react';
import { Zap, AlertCircle, Loader } from 'lucide-react';
import { keycloakService } from '../services/keycloak';

interface Props {
  onSuccess: (user: any) => void;
  onError: (error: string) => void;
}

export const OAuthCallback: React.FC<Props> = ({ onSuccess, onError }) => {
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      // Get authorization code from URL
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      // Check for OAuth errors
      if (error) {
        const message = errorDescription || error || 'Authentication failed';
        setStatus('error');
        setErrorMessage(message);
        onError(message);
        
        // Redirect to home after 3 seconds
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
        return;
      }

      // Check if code is present
      if (!code) {
        const message = 'No authorization code received';
        setStatus('error');
        setErrorMessage(message);
        onError(message);
        
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
        return;
      }

      try {
        // Exchange code for tokens
        const user = await keycloakService.handleCallback(code);
        
        // Notify parent component
        onSuccess(user);
        
        // Get redirect URI (where user was before login)
        const redirectUri = sessionStorage.getItem('auth_redirect_uri') || '/';
        sessionStorage.removeItem('auth_redirect_uri');
        
        // Redirect to original location or dashboard
        if (redirectUri === '/' || redirectUri.includes('/callback')) {
          window.location.href = user.role === 'SuperAdmin' ? '/super-admin' : '/dashboard';
        } else {
          window.location.href = redirectUri;
        }
      } catch (err: any) {
        const message = err.message || 'Authentication failed';
        setStatus('error');
        setErrorMessage(message);
        onError(message);
        
        // Redirect to home after 3 seconds
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    };

    handleCallback();
  }, [onSuccess, onError]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-600/10 p-3 rounded-xl">
              <Zap className="h-8 w-8 text-blue-500" />
            </div>
          </div>

          {status === 'processing' && (
            <>
              <h2 className="text-2xl font-bold text-white text-center mb-2">
                Completing Sign In
              </h2>
              <p className="text-slate-400 text-center mb-8 text-sm">
                Please wait while we verify your credentials...
              </p>
              <div className="flex justify-center">
                <Loader className="animate-spin text-blue-500" size={32} />
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <h2 className="text-2xl font-bold text-white text-center mb-2">
                Authentication Failed
              </h2>
              <div className="mt-6 p-4 bg-red-900/20 border border-red-900/50 rounded-lg flex items-start gap-3 text-sm text-red-400">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">Error</p>
                  <p>{errorMessage}</p>
                </div>
              </div>
              <p className="text-slate-500 text-center mt-6 text-sm">
                Redirecting to home page...
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

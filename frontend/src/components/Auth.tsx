
import React, { useState } from 'react';
import { Zap, ArrowLeft, Mail, Lock, AlertCircle, Shield } from 'lucide-react';
import { keycloakService } from '../services/keycloak';

interface Props {
  mode: 'login' | 'register';
  onLogin: (email: string, pass: string) => Promise<void>;
  onRegister: (name: string, company: string, email: string, pass: string) => Promise<void>;
  onBack: () => void;
  onSwitchMode: () => void;
}

export const Auth: React.FC<Props> = ({ mode, onLogin, onBack }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useKeycloak, setUseKeycloak] = useState(true); // Default to Keycloak

  const handleKeycloakLogin = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await keycloakService.login();
      // User will be redirected to Keycloak
    } catch (err: any) {
      setError(err.message || 'Failed to initialize login');
      setIsLoading(false);
    }
  };

  const handleLegacySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      await onLogin(email, password);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="text-slate-500 hover:text-white flex items-center gap-2 mb-8 transition-colors">
          <ArrowLeft size={16} /> Back to Home
        </button>

        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
          <div className="flex justify-center mb-6">
             <div className="bg-blue-600/10 p-3 rounded-xl">
               <Zap className="h-8 w-8 text-blue-500" />
             </div>
          </div>
          
          <h2 className="text-2xl font-bold text-white text-center mb-2">
            Welcome Back
          </h2>
          <p className="text-slate-400 text-center mb-8 text-sm">
            Access your sovereign data pipelines
          </p>

          {error && (
            <div className="mb-6 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-2 text-sm text-red-400">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {useKeycloak ? (
            <div className="space-y-4">
              <button 
                type="button"
                onClick={handleKeycloakLogin}
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-all shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] flex items-center justify-center gap-2"
              >
                <Shield size={18} />
                {isLoading ? 'Redirecting...' : 'Sign in with SSO'}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-slate-900 px-2 text-slate-500">OR</span>
                </div>
              </div>

              <button 
                type="button"
                onClick={() => setUseKeycloak(false)}
                className="w-full text-slate-400 hover:text-white text-sm transition-colors"
              >
                Use email and password
              </button>
            </div>
          ) : (
            <form onSubmit={handleLegacySubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-slate-500 w-5 h-5" />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-500 w-5 h-5" />
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg mt-6 transition-all shadow-[0_4px_14px_0_rgba(37,99,235,0.39)]"
            >
              {isLoading ? 'Processing...' : 'Log In'}
            </button>

            <button 
              type="button"
              onClick={() => setUseKeycloak(true)}
              className="w-full text-slate-400 hover:text-white text-sm transition-colors mt-4"
            >
              ← Back to SSO login
            </button>
          </form>
          )}

          <div className="mt-6 p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-500 text-center">
             <p className="font-semibold mb-1 text-slate-400">🔐 Protected Platform</p>
             <p>Access is by invitation only.</p>
             <p className="mt-2 text-slate-600">Contact your administrator for access</p>
          </div>
        </div>
      </div>
    </div>
  );
};

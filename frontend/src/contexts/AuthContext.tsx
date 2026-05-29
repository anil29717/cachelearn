import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '../utils/api';
import { User } from '../types';
import { bindSessionIdleHandlers, getSessionIdleMs } from '../utils/sessionIdle';

interface AuthContextType {
  user: User | null;
  session: any;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string, name: string, role?: string) => Promise<string>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [idleMs, setIdleMs] = useState(getSessionIdleMs);

  const fetchUserProfile = async () => {
    try {
      const { profile } = await apiClient.getProfile();
      setUser(profile);
      setSession({ authenticated: true });
    } catch {
      setUser(null);
      setSession(null);
    }
  };

  const refreshProfile = async () => {
    await fetchUserProfile();
  };

  const signOut = useCallback(async () => {
    try {
      await apiClient.logout().catch(() => {});
    } finally {
      setUser(null);
      setSession(null);
      apiClient.setAccessToken(null);
    }
  }, []);

  useEffect(() => {
    fetchUserProfile().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await apiClient.getSessionConfig();
        if (!cancelled && cfg.idle_minutes) {
          setIdleMs(Math.max(5, Math.min(480, cfg.idle_minutes)) * 60 * 1000);
        }
      } catch {
        /* use env default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    return bindSessionIdleHandlers(() => {
      void signOut();
    }, idleMs);
  }, [user, idleMs, signOut]);

  const signUp = async (email: string, password: string, name: string, role: string = 'employee') => {
    try {
      const { message } = await apiClient.register(email, password, name, role);
      return message || 'Account created.';
    } catch (error: any) {
      console.error('Sign up error:', error);
      throw error;
    }
  };

  const signIn = async (email: string, password: string): Promise<User> => {
    const { user: loginUser } = await apiClient.login(email, password);
    apiClient.setAccessToken(null);
    try {
      const { profile } = await apiClient.getProfile();
      setUser(profile as User);
      setSession({ authenticated: true });
      return profile as User;
    } catch (e) {
      console.error('Sign in error:', e);
      setUser(loginUser as User);
      setSession({ authenticated: true });
      throw new Error(
        'Signed in, but the session cookie was not accepted (Unauthorized). Restart the Vite dev server and backend, and confirm JWT_SECRET is set in backend/.env.'
      );
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

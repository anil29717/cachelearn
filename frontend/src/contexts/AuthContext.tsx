import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../utils/api';
import { User } from '../types';

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

  useEffect(() => {
    fetchUserProfile().finally(() => setLoading(false));
  }, []);

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

  const signOut = async () => {
    try {
      await apiClient.logout().catch(() => {});
    } finally {
      setUser(null);
      setSession(null);
      apiClient.setAccessToken(null);
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

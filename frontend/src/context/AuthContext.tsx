'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/utils/api';

export interface UserProfile {
  id: string;
  name: string;
  email?: string; // only returned to logged-in users
  avatarUrl?: string;
}

// Profile used last on this device (shown first on the login screen)
export const LAST_PROFILE_KEY = 'last_profile_id';
const rememberProfile = (userId: string) => {
  try {
    localStorage.setItem(LAST_PROFILE_KEY, userId);
  } catch {
    // Storage unavailable: nothing to remember
  }
};

// code + data let the login screen show a translated message (e.g. 'pin_wrong', { left: 3 })
export interface AuthResult {
  success: boolean;
  error?: string;
  code?: string;
  data?: Record<string, unknown>;
}

interface AuthContextType {
  user: UserProfile | null;
  authLoading: boolean;
  allUsers: UserProfile[];
  loginWithPin: (userId: string, pin: string) => Promise<AuthResult>;
  createProfile: (name: string, email: string, pin: string) => Promise<AuthResult>;
  resetPin: (userId: string, code: string, newPin: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  // Stable identity: LoginView re-runs its effect when this changes
  const refreshProfiles = useCallback(async () => {
    try {
      const data = await apiRequest('/users') as UserProfile[];
      setAllUsers(data || []);
    } catch (err) {
      console.error('Failed to load user profiles from backend:', err);
    }
  }, []);

  useEffect(() => {
    // The session lives in an HttpOnly cookie; ask the server who we are
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_profile'); // leftover from the old browser-only login
    }
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (res.ok) {
          const data = await res.json() as { user: UserProfile };
          setUser(data.user);
        }
      } catch (err) {
        console.error('Failed to check login session:', err);
      } finally {
        setAuthLoading(false);
      }
      refreshProfiles();
    })();
  }, [refreshProfiles]);

  // Any API call answered with 401 means the session is gone
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const loginWithPin = async (userId: string, pin: string) => {
    try {
      const res = await apiRequest('/users/login', {
        method: 'POST',
        body: JSON.stringify({ userId, pin })
      }) as any;

      if (res && res.success && res.user) {
        setUser(res.user);
        rememberProfile(res.user.id);
        refreshProfiles();
        return { success: true };
      }
      return { success: false, error: res?.error || 'Authentication failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Incorrect PIN or server error', code: err.code, data: err.data };
    }
  };

  const createProfile = async (name: string, email: string, pin: string) => {
    try {
      const res = await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, pin })
      }) as any;

      if (res && res.success && res.user) {
        setUser(res.user);
        rememberProfile(res.user.id);
        await refreshProfiles();
        return { success: true };
      }
      return { success: false, error: res?.error || 'Failed to create profile' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Profile creation failed', code: err.code, data: err.data };
    }
  };

  // Choose a new PIN with a one-time reset code from a trip owner (also logs in)
  const resetPin = async (userId: string, code: string, newPin: string) => {
    try {
      const res = await apiRequest('/users/reset-pin', {
        method: 'POST',
        body: JSON.stringify({ userId, code, newPin })
      }) as any;
      if (res && res.success && res.user) {
        setUser(res.user);
        rememberProfile(res.user.id);
        refreshProfiles();
        return { success: true };
      }
      return { success: false, error: res?.error || 'Could not reset the PIN' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Could not reset the PIN', code: err.code, data: err.data };
    }
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout request failed:', err);
    }
    setUser(null);
    refreshProfiles();
  };

  return (
    <AuthContext.Provider value={{ user, authLoading, allUsers, loginWithPin, createProfile, resetPin, logout, refreshProfiles }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

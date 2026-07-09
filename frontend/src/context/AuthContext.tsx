'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from '@/utils/api';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  allUsers: UserProfile[];
  loginWithPin: (userId: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  createProfile: (name: string, email: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshProfiles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  const refreshProfiles = async () => {
    try {
      const data = await apiRequest('/users') as UserProfile[];
      setAllUsers(data || []);
    } catch (err) {
      console.error('Failed to load user profiles from backend:', err);
    }
  };

  useEffect(() => {
    refreshProfiles();

    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('user_profile');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    }
  }, []);

  const loginWithPin = async (userId: string, pin: string) => {
    try {
      const res = await apiRequest('/users/login', {
        method: 'POST',
        body: JSON.stringify({ userId, pin })
      }) as any;

      if (res && res.success && res.user) {
        setUser(res.user);
        localStorage.setItem('user_profile', JSON.stringify(res.user));
        return { success: true };
      }
      return { success: false, error: res?.error || 'Authentication failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Incorrect PIN or server error' };
    }
  };

  const createProfile = async (name: string, email: string, pin: string) => {
    try {
      const res = await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, pin })
      }) as any;

      if (res && res.success && res.user) {
        await refreshProfiles();
        setUser(res.user);
        localStorage.setItem('user_profile', JSON.stringify(res.user));
        return { success: true };
      }
      return { success: false, error: res?.error || 'Failed to create profile' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Profile creation failed' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user_profile');
  };

  return (
    <AuthContext.Provider value={{ user, allUsers, loginWithPin, createProfile, logout, refreshProfiles }}>
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

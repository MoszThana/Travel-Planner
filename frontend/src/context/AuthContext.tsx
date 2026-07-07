'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  allUsers: UserProfile[];
  login: (username: string) => void;
  logout: () => void;
  setCurrentUserById: (id: string) => void;
}

// Predefined mock users for collaborative group feature testing
const MOCK_USERS: UserProfile[] = [
  { id: 'user-maru', name: 'Maru', email: 'maru@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Maru' },
  { id: 'user-somchai', name: 'Somchai', email: 'somchai@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Somchai' },
  { id: 'user-jane', name: 'Jane', email: 'jane@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Jane' },
  { id: 'user-david', name: 'David', email: 'david@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=David' },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('user_profile');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      } else {
        // Default to Maru on first load for easy prototype testing
        setUser(MOCK_USERS[0]);
        localStorage.setItem('user_profile', JSON.stringify(MOCK_USERS[0]));
      }
    }
  }, []);

  const login = (username: string) => {
    const formattedName = username.trim();
    if (!formattedName) return;

    // Check if user matches any mock users, otherwise create custom
    const existing = MOCK_USERS.find(u => u.name.toLowerCase() === formattedName.toLowerCase());
    if (existing) {
      setUser(existing);
      localStorage.setItem('user_profile', JSON.stringify(existing));
    } else {
      const newUser: UserProfile = {
        id: `user-${Date.now()}`,
        name: formattedName,
        email: `${formattedName.toLowerCase().replace(/\s+/g, '')}@example.com`,
        avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${formattedName}`
      };
      setUser(newUser);
      localStorage.setItem('user_profile', JSON.stringify(newUser));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user_profile');
  };

  const setCurrentUserById = (id: string) => {
    const found = MOCK_USERS.find(u => u.id === id);
    if (found) {
      setUser(found);
      localStorage.setItem('user_profile', JSON.stringify(found));
    }
  };

  return (
    <AuthContext.Provider value={{ user, allUsers: MOCK_USERS, login, logout, setCurrentUserById }}>
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

'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import styles from './LoginView.module.css';

export const LoginView: React.FC = () => {
  const { allUsers, loginWithPin, createProfile, refreshProfiles } = useAuth();
  const [tab, setTab] = useState<'login' | 'create'>('login');
  
  // Login State
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  // Create Profile State
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPin, setNewPin] = useState('');
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  useEffect(() => {
    if (allUsers.length > 0 && !selectedUserId) {
      setSelectedUserId(allUsers[0].id);
    }
  }, [allUsers, selectedUserId]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || loginPin.length !== 4) {
      setLoginError('Please select a profile and enter a 4-digit PIN.');
      return;
    }

    setLoading(true);
    setLoginError('');

    const res = await loginWithPin(selectedUserId, loginPin);
    setLoading(false);
    if (!res.success) {
      setLoginError(res.error || 'Invalid PIN.');
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || newPin.length !== 4) {
      setCreateError('Please fill in all fields and enter a 4-digit PIN.');
      return;
    }

    setLoading(true);
    setCreateError('');

    const res = await createProfile(newName, newEmail, newPin);
    setLoading(false);
    if (!res.success) {
      setCreateError(res.error || 'Failed to create profile.');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>Antigravity Trip</div>
          <div className={styles.subtitle}>Collaborative Travel Planner</div>
        </div>

        <div className={styles.tabs}>
          <button 
            type="button" 
            className={`${styles.tabBtn} ${tab === 'login' ? styles.tabBtnActive : ''}`}
            onClick={() => {
              setTab('login');
              setLoginError('');
            }}
          >
            Select Profile
          </button>
          <button 
            type="button" 
            className={`${styles.tabBtn} ${tab === 'create' ? styles.tabBtnActive : ''}`}
            onClick={() => {
              setTab('create');
              setCreateError('');
            }}
          >
            Create Profile
          </button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className={styles.form}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Select Profile</label>
              {allUsers.length > 0 ? (
                <select 
                  className={styles.select}
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      👤 {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize: '12px', color: '#9ca3af', padding: '8px 0' }}>
                  No profiles found. Switch tab to create one!
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>4-Digit PIN Password</label>
              <input
                type="password"
                maxLength={4}
                pattern="[0-9]*"
                inputMode="numeric"
                placeholder="••••"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ''))}
                className={styles.input}
                style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '8px' }}
              />
            </div>

            {loginError && <div className={styles.error}>{loginError}</div>}

            <button type="submit" disabled={loading || allUsers.length === 0} className={styles.submitBtn}>
              {loading ? 'Logging in...' : 'Access Profile'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreateSubmit} className={styles.form}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Full Name</label>
              <input
                type="text"
                required
                placeholder="Your name"
                className={styles.input}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Email Address</label>
              <input
                type="email"
                required
                placeholder="yourname@example.com"
                className={styles.input}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Set 4-Digit PIN Password</label>
              <input
                type="password"
                maxLength={4}
                pattern="[0-9]*"
                inputMode="numeric"
                placeholder="••••"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                className={styles.input}
                style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '8px' }}
              />
            </div>

            {createError && <div className={styles.error}>{createError}</div>}

            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? 'Creating...' : 'Create & Access Profile'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

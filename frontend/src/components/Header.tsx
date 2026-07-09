'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import styles from './Header.module.css';

export const Header: React.FC = () => {
  const { locale, setLocale } = useTranslation();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
        <div 
          className={`${styles.statusIndicator} ${!isOnline ? styles.statusOffline : ''}`} 
          title={isOnline ? 'Online' : 'Offline'} 
        />
        <span className={styles.logo}>Antigravity Trip</span>
      </div>

      <div className={styles.rightSection}>
        {/* Language Toggle */}
        <div className={styles.langToggle}>
          <button 
            className={`${styles.langBtn} ${locale === 'en' ? styles.langBtnActive : ''}`} 
            onClick={() => setLocale('en')}
          >
            EN
          </button>
          <button 
            className={`${styles.langBtn} ${locale === 'th' ? styles.langBtnActive : ''}`} 
            onClick={() => setLocale('th')}
          >
            TH
          </button>
        </div>

        {/* Profile Switcher */}
        {user && (
          <div className={styles.profileWrapper}>
            <button 
              className={`${styles.avatarBtn} ${dropdownOpen ? styles.avatarBtnActive : ''}`}
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-label="Switch User Profile"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user.avatarUrl} alt={user.name} className={styles.avatarImage} />
            </button>

            {dropdownOpen && (
              <div className={styles.dropdown} style={{ minWidth: '180px', padding: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={user.avatarUrl} alt={user.name} style={{ width: '48px', height: '48px', borderRadius: '50%' }} />
                  <span style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text)' }}>{user.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user.email}</span>
                </div>
                <button 
                  className={styles.userOption}
                  style={{ 
                    justifyContent: 'center', 
                    color: '#ef4444', 
                    border: '1px solid var(--border)', 
                    borderRadius: '6px', 
                    padding: '8px', 
                    width: '100%',
                    background: 'transparent',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    logout();
                    setDropdownOpen(false);
                  }}
                >
                  🚪 Log Out / Switch Profile
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

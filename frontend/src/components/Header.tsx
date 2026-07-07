'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import styles from './Header.module.css';

export const Header: React.FC = () => {
  const { locale, setLocale } = useTranslation();
  const { user, allUsers, setCurrentUserById } = useAuth();
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

  const selectUser = (userId: string) => {
    setCurrentUserById(userId);
    setDropdownOpen(false);
  };

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
              <div className={styles.dropdown}>
                <span className={styles.dropdownTitle}>Test Profile</span>
                {allUsers.map((u) => (
                  <button 
                    key={u.id}
                    className={`${styles.userOption} ${user.id === u.id ? styles.userOptionActive : ''}`}
                    onClick={() => selectUser(u.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.avatarUrl} alt={u.name} className={styles.smallAvatar} />
                    <span>{u.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

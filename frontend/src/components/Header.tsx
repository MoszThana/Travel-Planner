'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import styles from './Header.module.css';
import { Icon } from './Icon';
import { TabType, useNavItems } from './BottomNav';

interface HeaderProps {
  // When a trip is open, the desktop header shows the trip tabs as pills
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
  onHome?: () => void;
  // Bell for the open trip's "What's new" list
  whatsNew?: { unread: number; onOpen: () => void };
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, onHome, whatsNew }) => {
  const { t, locale, setLocale } = useTranslation();
  const { user, logout } = useAuth();
  const navItems = useNavItems();
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
      <div className={styles.inner}>
        <button className={styles.brand} onClick={onHome} aria-label={t('header.home')}>
          <span className={styles.brandMark}>
            <Icon name="pin" size={18} strokeWidth={2.25} />
          </span>
          <span className={styles.logo}>Travel Planner</span>
          <span
            className={`${styles.statusIndicator} ${!isOnline ? styles.statusOffline : ''}`}
            title={isOnline ? 'Online' : 'Offline'}
          />
        </button>

        {activeTab && onTabChange && (
          <nav className={`${styles.nav} desktop-only`}>
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`${styles.navPill} ${activeTab === item.id ? styles.navPillActive : ''}`}
                onClick={() => onTabChange(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}

        <div className={styles.rightSection}>
          {whatsNew && (
            <button
              type="button"
              className={styles.bellBtn}
              onClick={whatsNew.onOpen}
              aria-label={whatsNew.unread > 0 ? t('whatsnew.bell_unread', { count: whatsNew.unread }) : t('whatsnew.title')}
              title={t('whatsnew.title')}
            >
              <Icon name="bell" size={18} />
              {whatsNew.unread > 0 && <span className={styles.bellBadge}>{whatsNew.unread > 9 ? '9+' : whatsNew.unread}</span>}
            </button>
          )}

          <div className={`segmented ${styles.langToggle}`}>
            <button className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>
              EN
            </button>
            <button className={locale === 'th' ? 'active' : ''} onClick={() => setLocale('th')}>
              TH
            </button>
          </div>

          {user && (
            <div className={styles.profileWrapper}>
              <button
                className={`${styles.avatarBtn} ${dropdownOpen ? styles.avatarBtnActive : ''}`}
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-label={t('header.profile_menu')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={user.avatarUrl} alt={user.name} className={styles.avatarImage} />
              </button>

              {dropdownOpen && (
                <div className={styles.dropdown}>
                  <div className={styles.profileCard}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={user.avatarUrl} alt={user.name} className="avatar avatar-lg" />
                    <div className={styles.profileText}>
                      <span className={styles.profileName}>{user.name}</span>
                      <span className={styles.profileEmail}>{user.email}</span>
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-danger btn-block"
                    onClick={() => {
                      logout();
                      setDropdownOpen(false);
                    }}
                  >
                    <Icon name="logout" size={15} />
                    {t('header.logout')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

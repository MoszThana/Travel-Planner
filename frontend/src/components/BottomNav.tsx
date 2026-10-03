'use client';

import React from 'react';
import { useTranslation } from '@/context/TranslationContext';
import styles from './BottomNav.module.css';
import { Icon, IconName } from './Icon';

export type TabType = 'home' | 'map' | 'budget' | 'group' | 'ai';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

// Shared by the phone bottom bar and the desktop header nav
export const useNavItems = (): { id: TabType; label: string; icon: IconName }[] => {
  const { t } = useTranslation();
  return [
    { id: 'home', label: t('nav.home'), icon: 'calendar' },
    { id: 'map', label: t('nav.map'), icon: 'map' },
    { id: 'budget', label: t('nav.budget'), icon: 'wallet' },
    { id: 'group', label: t('nav.group'), icon: 'users' },
    { id: 'ai', label: t('nav.ai_assistant'), icon: 'sparkles' },
  ];
};

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const navItems = useNavItems();

  return (
    <nav className={`${styles.navContainer} mobile-only`}>
      {navItems.map((item) => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            onClick={() => onTabChange(item.id)}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className={styles.iconWrapper}>
              <Icon name={item.icon} size={20} strokeWidth={isActive ? 2 : 1.75} />
            </span>
            <span className={styles.label}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

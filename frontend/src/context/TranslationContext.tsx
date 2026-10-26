'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import en from '../locales/en.json';
import th from '../locales/th.json';

export type Locale = 'en' | 'th';

interface TranslationContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

const translations = { en, th };

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>('en');

  // Load preferred language from localStorage if available
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('locale') as Locale;
      if (saved === 'en' || saved === 'th') {
        setLocaleState(saved);
      } else if (navigator.language?.toLowerCase().startsWith('th')) {
        // First visit on a Thai phone/browser: start in Thai
        setLocaleState('th');
      }
    }
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', newLocale);
    }
  };

  const lookup = (dict: any, keyPath: string): string | null => {
    let value: any = dict;
    for (const key of keyPath.split('.')) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    return typeof value === 'string' ? value : null;
  };

  const t = (keyPath: string, replacements?: Record<string, string | number>): string => {
    // Missing Thai text falls back to English, never to the raw key
    let result = lookup(translations[locale], keyPath) ?? lookup(translations.en, keyPath) ?? keyPath;
    if (replacements) {
      Object.entries(replacements).forEach(([k, v]) => {
        result = result.split(`{${k}}`).join(String(v));
      });
    }
    return result;
  };

  // Screen readers and fonts follow the chosen language
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <TranslationContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </TranslationContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
};

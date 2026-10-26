'use client';

import React from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { timeAgo } from '@/utils/time';
import { useEscape } from '@/utils/useEscape';
import { Icon, IconName } from './Icon';
import styles from './WhatsNew.module.css';

export interface TripEvent {
  id: string;
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  type: string;
  summary: string;
  createdAt: number;
}

const ICONS: Record<string, IconName> = {
  activity: 'calendar',
  day: 'calendar',
  expense: 'wallet',
  settlement: 'wallet',
  contact: 'phone',
  file: 'paperclip',
  member: 'users',
  trip: 'edit',
};

interface WhatsNewProps {
  events: TripEvent[];
  seenAt: number;
  currentUserId?: string;
  onClose: () => void;
}

// Fixed English words the server writes into summaries
const WORDS: Record<string, string> = {
  'can edit': 'can_edit',
  'view only': 'view_only',
  editor: 'editor',
  viewer: 'viewer',
  'a contact': 'a_contact',
  'an expense': 'an_expense',
  'a member': 'a_member',
  budget: 'budget',
  currency: 'currency',
};

// "What's new" sheet: the latest changes in this trip, newest first
export const WhatsNew: React.FC<WhatsNewProps> = ({ events, seenAt, currentUserId, onClose }) => {
  const { t, locale } = useTranslation();
  useEscape(onClose);

  // Summaries are stored in English; translate the fixed parts (names stay as typed)
  const localize = (ev: TripEvent) => {
    let text = ev.summary.replace(/\bDay (\d+)\b/g, (_, n) => t('whatsnew.words.day', { number: n }));
    if (ev.type === 'member.joined' || ev.type.endsWith('.deleted') || ev.type === 'member.removed') {
      if (WORDS[text]) return t(`whatsnew.words.${WORDS[text]}`);
    }
    if (ev.type === 'trip.edited') {
      return text.split(', ').map((w) => (WORDS[w] ? t(`whatsnew.words.${WORDS[w]}`) : w)).join(', ');
    }
    if (ev.type === 'member.added' || ev.type === 'member.role_changed') {
      text = text.replace(/\b(editor|viewer)\b/, (w) => t(`whatsnew.words.${w}`));
    }
    return text;
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="sheet-title">{t('whatsnew.title')}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {events.length === 0 ? (
          <div className="empty">
            <Icon name="bell" size={26} />
            {t('whatsnew.empty')}
          </div>
        ) : (
          <ul className={styles.list}>
            {events.map((ev) => {
              const isNew = ev.createdAt > seenAt && ev.userId !== currentUserId;
              const who = ev.userId === currentUserId ? t('whatsnew.you') : ev.userName || t('whatsnew.someone');
              return (
                <li key={ev.id} className={`${styles.item} ${isNew ? styles.itemNew : ''}`}>
                  <span className={styles.avatarWrap}>
                    {ev.userAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ev.userAvatar} alt="" className="avatar" />
                    ) : (
                      <span className={styles.avatarFallback} />
                    )}
                    <span className={styles.typeIcon}>
                      <Icon name={ICONS[ev.type.split('.')[0]] || 'info'} size={11} strokeWidth={2.2} />
                    </span>
                  </span>
                  <div className={styles.text}>
                    <span>
                      <strong>{who}</strong> {t(`whatsnew.types.${ev.type}`)}{' '}
                      <span className={styles.summary}>{localize(ev)}</span>
                    </span>
                    <span className={styles.time}>{timeAgo(ev.createdAt, locale)}</span>
                  </div>
                  {isNew && <span className={styles.dot} aria-label={t('whatsnew.new')} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

'use client';

import React, { useState } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { apiRequest } from '@/utils/api';
import { useEscape } from '@/utils/useEscape';
import { Icon } from './Icon';

interface CheckInSheetProps {
  activity: any;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}

// One small form for "I'm here": arrival time, what was actually spent, a note.
export const CheckInSheet: React.FC<CheckInSheetProps> = ({ activity, currency, onClose, onSaved }) => {
  const { t } = useTranslation();
  const now = new Date();
  const [time, setTime] = useState(
    activity.time || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  );
  const [spent, setSpent] = useState(String(activity.actCost || activity.estCost || ''));
  const [note, setNote] = useState(activity.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEscape(onClose, !saving);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/activities/${activity.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          visited: 1,
          time,
          actCost: parseFloat(spent) || 0,
          notes: note,
        }),
      });
      onSaved();
    } catch (err: any) {
      setError(err?.message || t('checkin.error'));
      setSaving(false);
    }
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <span className="eyebrow">{t('checkin.eyebrow')}</span>
            <h2 className="sheet-title">{activity.name}</h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t('common.cancel')}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={save} className="form">
          <div className="field-row">
            <div className="field">
              <label className="label">{t('checkin.arrived_at')}</label>
              <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">{t('checkin.spent', { currency })}</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                className="input"
                placeholder="0"
                value={spent}
                onChange={(e) => setSpent(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label className="label">{t('checkin.note')}</label>
            <textarea
              className="input"
              placeholder={t('checkin.note_placeholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="btn-row">
            <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Icon name="check" size={16} />
              {saving ? t('common.loading') : t('checkin.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

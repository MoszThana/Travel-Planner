'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, LAST_PROFILE_KEY, AuthResult } from '@/context/AuthContext';
import { useTranslation } from '@/context/TranslationContext';
import styles from './LoginView.module.css';
import { Icon } from './Icon';

interface LoginViewProps {
  // Token from an invite link (?invite=...), accepted automatically after login
  inviteToken?: string | null;
}

interface InvitePreview {
  trip: { name: string; destination: string; startDate: number; endDate: number };
  inviterName: string;
  role: string;
}

type Mode = 'login' | 'create' | 'reset';

const digitsOnly = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

export const LoginView: React.FC<LoginViewProps> = ({ inviteToken }) => {
  const { allUsers, loginWithPin, createProfile, resetPin, refreshProfiles } = useAuth();
  const { t, locale } = useTranslation();
  // Invited friends usually don't have a profile yet
  const [mode, setMode] = useState<Mode>(inviteToken ? 'create' : 'login');
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteError, setInviteError] = useState('');

  // Login State
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Create Profile State
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPin, setNewPin] = useState('');

  // Forgot PIN State
  const [resetCode, setResetCode] = useState('');
  const [resetPinValue, setResetPinValue] = useState('');
  const [resetPinConfirm, setResetPinConfirm] = useState('');

  const dateLocale = locale === 'th' ? 'th-TH' : 'en-GB';

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`/api/invites/${encodeURIComponent(inviteToken)}`)
      .then(async (res) => {
        const data = await res.json() as any;
        if (res.ok) setInvite(data);
        else setInviteError(data.error || t('login.invite_invalid'));
      })
      .catch(() => setInviteError(t('login.invite_check_failed')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken]);

  // The profile last used on this device comes first and is selected
  let lastProfileId: string | null = null;
  try {
    lastProfileId = typeof window !== 'undefined' ? localStorage.getItem(LAST_PROFILE_KEY) : null;
  } catch {
    lastProfileId = null;
  }
  const profiles = [...allUsers].sort((a, b) => (a.id === lastProfileId ? -1 : b.id === lastProfileId ? 1 : 0));

  useEffect(() => {
    if (profiles.length > 0 && !selectedUserId) {
      setSelectedUserId(profiles[0].id);
    }
  }, [profiles, selectedUserId]);

  // Server error codes → translated text (falls back to the server's English message)
  const authError = (res: AuthResult, fallbackKey: string) => {
    if (res.code) {
      const key = `login.errors.${res.code}`;
      const text = t(key, { left: Number(res.data?.left ?? 0), minutes: Number(res.data?.minutes ?? 0) });
      if (text !== key) return text;
    }
    return res.error || t(fallbackKey);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || loginPin.length !== 4) {
      setError(t('login.need_profile_and_pin'));
      return;
    }
    setLoading(true);
    setError('');
    const res = await loginWithPin(selectedUserId, loginPin);
    setLoading(false);
    if (!res.success) setError(authError(res, 'login.wrong_pin'));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || newPin.length !== 4) {
      setError(t('login.need_all_fields'));
      return;
    }
    setLoading(true);
    setError('');
    const res = await createProfile(newName, newEmail, newPin);
    setLoading(false);
    if (!res.success) setError(authError(res, 'login.create_failed'));
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || resetCode.length !== 6) {
      setError(t('login.need_reset_code'));
      return;
    }
    if (resetPinValue.length !== 4) {
      setError(t('login.need_new_pin'));
      return;
    }
    if (resetPinValue !== resetPinConfirm) {
      setError(t('login.pins_dont_match'));
      return;
    }
    setLoading(true);
    setError('');
    const res = await resetPin(selectedUserId, resetCode, resetPinValue);
    setLoading(false);
    if (!res.success) setError(authError(res, 'login.reset_failed'));
  };

  const profilePicker = (
    <div className="field">
      <label className="label">{mode === 'reset' ? t('login.whose_pin') : t('login.who')}</label>
      {profiles.length > 0 ? (
        <div className={styles.profileGrid} role="radiogroup">
          {profiles.map((u) => {
            const selected = u.id === selectedUserId;
            return (
              <button
                key={u.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`${styles.profileTile} ${selected ? styles.profileTileActive : ''}`}
                onClick={() => {
                  setSelectedUserId(u.id);
                  setError('');
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u.avatarUrl} alt="" className={styles.profileAvatar} />
                <span className={styles.profileName}>{u.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyProfiles}>{t('login.no_profiles')}</div>
      )}
    </div>
  );

  const pinInput = (value: string, onChange: (v: string) => void, label: string, autoComplete = 'current-password') => (
    <div className="field">
      <label className="label">{label}</label>
      <input
        type="password"
        maxLength={4}
        pattern="[0-9]*"
        inputMode="numeric"
        autoComplete={autoComplete}
        placeholder="••••"
        value={value}
        onChange={(e) => onChange(digitsOnly(e.target.value, 4))}
        className={`input ${styles.pinInput}`}
      />
    </div>
  );

  return (
    <div className={styles.container}>
      <section className={`hero ${styles.hero}`}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Icon name="pin" size={18} strokeWidth={2.25} />
          </span>
          Travel Planner
        </div>
        <div>
          <h1 className="hero-title">
            {t('login.hero_before')} <span className="hero-highlight">{t('login.hero_highlight')}</span>
          </h1>
          <p className="hero-text">{t('login.hero_text')}</p>
        </div>
      </section>

      <div className={styles.card}>
        {invite && (
          <div className={styles.inviteBanner}>
            <Icon name="users" size={18} />
            <div>
              {t('login.invited_by', { name: invite.inviterName, trip: invite.trip.name })}
              <span className={styles.inviteMeta}>
                {invite.trip.destination} · {new Date(invite.trip.startDate).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}
                {' – '}
                {new Date(invite.trip.endDate).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className={styles.inviteMeta}>{t('login.invite_hint')}</span>
            </div>
          </div>
        )}
        {inviteError && <div className="form-error">{inviteError}</div>}

        <div className={styles.header}>
          <h2 className={styles.formTitle}>
            {mode === 'reset' ? t('login.reset_title') : mode === 'create' ? t('login.create_title') : t('login.welcome')}
          </h2>
          <p className={styles.formSubtitle}>
            {mode === 'reset' ? t('login.reset_subtitle') : mode === 'create' ? t('login.create_subtitle') : t('login.welcome_subtitle')}
          </p>
        </div>

        {mode !== 'reset' && (
          <div className="segmented">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
              {t('login.sign_in')}
            </button>
            <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => switchMode('create')}>
              {t('login.new_profile')}
            </button>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="form">
            {profilePicker}
            {pinInput(loginPin, setLoginPin, t('login.pin'))}

            {error && <div className="form-error">{error}</div>}

            <button type="submit" disabled={loading || profiles.length === 0} className="btn btn-primary btn-block">
              {loading ? t('login.signing_in') : t('login.continue')}
            </button>
            <button type="button" className={styles.textLink} onClick={() => switchMode('reset')}>
              {t('login.forgot_pin')}
            </button>
          </form>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreateSubmit} className="form">
            <div className="field">
              <label className="label">{t('login.name')}</label>
              <input
                type="text"
                required
                autoComplete="name"
                placeholder={t('login.name_placeholder')}
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">{t('login.email')}</label>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="yourname@example.com"
                className="input"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>

            {pinInput(newPin, setNewPin, t('login.choose_pin'), 'new-password')}

            {error && <div className="form-error">{error}</div>}

            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading ? t('login.creating') : invite ? t('login.create_and_join') : t('login.create')}
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleResetSubmit} className="form">
            <div className={styles.resetHelp}>
              <Icon name="key" size={18} />
              <span>{t('login.reset_help')}</span>
            </div>

            {profilePicker}

            <div className="field">
              <label className="label">{t('login.reset_code')}</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                placeholder="000 000"
                value={resetCode.length > 3 ? `${resetCode.slice(0, 3)} ${resetCode.slice(3)}` : resetCode}
                onChange={(e) => setResetCode(digitsOnly(e.target.value, 6))}
                className={`input ${styles.pinInput}`}
              />
            </div>

            <div className="field-row">
              {pinInput(resetPinValue, setResetPinValue, t('login.new_pin'), 'new-password')}
              {pinInput(resetPinConfirm, setResetPinConfirm, t('login.repeat_pin'), 'new-password')}
            </div>

            {error && <div className="form-error">{error}</div>}

            <button type="submit" disabled={loading || profiles.length === 0} className="btn btn-primary btn-block">
              {loading ? t('common.loading') : t('login.save_new_pin')}
            </button>
            <button type="button" className={styles.textLink} onClick={() => switchMode('login')}>
              {t('login.back_to_sign_in')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

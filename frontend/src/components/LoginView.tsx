'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
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

export const LoginView: React.FC<LoginViewProps> = ({ inviteToken }) => {
  const { allUsers, loginWithPin, createProfile, refreshProfiles } = useAuth();
  // Invited friends usually don't have a profile yet
  const [tab, setTab] = useState<'login' | 'create'>(inviteToken ? 'create' : 'login');
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteError, setInviteError] = useState('');
  
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
    if (!inviteToken) return;
    fetch(`/api/invites/${encodeURIComponent(inviteToken)}`)
      .then(async (res) => {
        const data = await res.json() as any;
        if (res.ok) setInvite(data);
        else setInviteError(data.error || 'This invite link is not valid.');
      })
      .catch(() => setInviteError("Couldn't check the invite link."));
  }, [inviteToken]);

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
      <section className={`hero ${styles.hero}`}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Icon name="pin" size={18} strokeWidth={2.25} />
          </span>
          Travel Planner
        </div>
        <div>
          <h1 className="hero-title">
            Plan together, <span className="hero-highlight">travel light</span>
          </h1>
          <p className="hero-text">
            Build day-by-day itineraries, map your route, track the budget and split costs with your group.
          </p>
        </div>
      </section>

      <div className={styles.card}>
        {invite && (
          <div className={styles.inviteBanner}>
            <Icon name="users" size={18} />
            <div>
              <strong>{invite.inviterName}</strong> invited you to <strong>{invite.trip.name}</strong>
              <span className={styles.inviteMeta}>
                {invite.trip.destination} · {new Date(invite.trip.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                {' – '}
                {new Date(invite.trip.endDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className={styles.inviteMeta}>Create a profile (or sign in) to join.</span>
            </div>
          </div>
        )}
        {inviteError && <div className="form-error">{inviteError}</div>}

        <div className={styles.header}>
          <h2 className={styles.formTitle}>Welcome back</h2>
          <p className={styles.formSubtitle}>Choose your profile and enter your PIN.</p>
        </div>

        <div className="segmented">
          <button
            type="button"
            className={tab === 'login' ? 'active' : ''}
            onClick={() => {
              setTab('login');
              setLoginError('');
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={tab === 'create' ? 'active' : ''}
            onClick={() => {
              setTab('create');
              setCreateError('');
            }}
          >
            New profile
          </button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="form">
            <div className="field">
              <label className="label">Who&apos;s planning?</label>
              {allUsers.length > 0 ? (
                <div className={styles.profileGrid} role="radiogroup">
                  {allUsers.map((u) => {
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
                          setLoginError('');
                        }}
                        title={u.email}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u.avatarUrl} alt="" className={styles.profileAvatar} />
                        <span className={styles.profileName}>{u.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyProfiles}>
                  No profiles yet — create one to get started.
                </div>
              )}
            </div>

            <div className="field">
              <label className="label">4-digit PIN</label>
              <input
                type="password"
                maxLength={4}
                pattern="[0-9]*"
                inputMode="numeric"
                placeholder="••••"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ''))}
                className={`input ${styles.pinInput}`}
              />
            </div>

            {loginError && <div className="form-error">{loginError}</div>}

            <button type="submit" disabled={loading || allUsers.length === 0} className="btn btn-primary btn-block">
              {loading ? 'Signing in…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreateSubmit} className="form">
            <div className="field">
              <label className="label">Full name</label>
              <input
                type="text"
                required
                placeholder="Your name"
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">Email</label>
              <input
                type="email"
                required
                placeholder="yourname@example.com"
                className="input"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">Choose a 4-digit PIN</label>
              <input
                type="password"
                maxLength={4}
                pattern="[0-9]*"
                inputMode="numeric"
                placeholder="••••"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                className={`input ${styles.pinInput}`}
              />
            </div>

            {createError && <div className="form-error">{createError}</div>}

            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading ? 'Creating…' : 'Create profile'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

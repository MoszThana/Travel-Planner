'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest, showError, showSuccess } from '@/utils/api';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth, UserProfile } from '@/context/AuthContext';
import { Icon } from './Icon';
import { confirmDialog } from './Feedback';

interface TripMember {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: string; // 'owner' | 'editor' | 'viewer'
}

interface MembersModalProps {
  tripId: string;
  isOpen: boolean;
  onClose: () => void;
  members: TripMember[];
  userRole: string; // 'owner' | 'editor' | 'viewer'
  onRefresh: () => void;
}

export const MembersModal: React.FC<MembersModalProps> = ({
  tripId,
  isOpen,
  onClose,
  members,
  userRole,
  onRefresh
}) => {
  const { allUsers, refreshProfiles } = useAuth();
  const { t, locale } = useTranslation();
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      refreshProfiles();
      setError('');
    }
  }, [isOpen, refreshProfiles]);

  // Filter out system users who are already members
  const joinableUsers = allUsers.filter(
    (u) => !members.some((m) => m.id === u.id)
  );

  useEffect(() => {
    if (joinableUsers.length > 0) {
      setInviteUserId(joinableUsers[0].id);
    } else {
      setInviteUserId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUsers, members]);

  // Invite links (owner only)
  const isOwner = userRole === 'owner';
  const [invites, setInvites] = useState<{ token: string; role: string; expiresAt: number }[]>([]);
  const [linkRole, setLinkRole] = useState<'editor' | 'viewer'>('editor');
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [resetInfo, setResetInfo] = useState<{ name: string; code: string; expiresAt: number } | null>(null);

  const loadInvites = useCallback(async () => {
    try {
      setInvites(await apiRequest(`/trips/${tripId}/invites`));
    } catch {
      setInvites([]);
    }
  }, [tripId]);

  useEffect(() => {
    if (isOpen && isOwner) loadInvites();
  }, [isOpen, isOwner, loadInvites]);

  if (!isOpen) return null;

  const inviteUrl = (token: string) => `${window.location.origin}/?invite=${encodeURIComponent(token)}`;

  const handleCreateLink = async () => {
    setCreatingLink(true);
    try {
      await apiRequest(`/trips/${tripId}/invites`, {
        method: 'POST',
        body: JSON.stringify({ role: linkRole })
      });
      await loadInvites();
    } catch (err) {
      showError(err, t('members.link_failed'));
    } finally {
      setCreatingLink(false);
    }
  };

  // Phones: open the share sheet (LINE, WhatsApp…); otherwise copy to the clipboard
  const handleShareLink = async (token: string) => {
    const url = inviteUrl(token);
    try {
      if (navigator.share) {
        await navigator.share({ title: t('members.share_title'), text: t('members.share_text'), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch (err) {
      // Share sheet dismissed by the user is not an error
      if ((err as any)?.name !== 'AbortError') showError(err, t('members.copy_failed'));
    }
  };

  const handleRevokeLink = async (token: string) => {
    if (!(await confirmDialog({ title: t('members.cancel_link_title'), message: t('members.cancel_link_message'), confirmLabel: t('members.cancel_link'), cancelLabel: t('members.keep'), danger: true }))) return;
    try {
      await apiRequest(`/trips/${tripId}/invites?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
      await loadInvites();
    } catch (err) {
      showError(err, t('members.cancel_failed'));
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUserId) return;

    setSaving(true);
    setError('');
    try {
      await apiRequest(`/trips/${tripId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: inviteUserId, role: inviteRole })
      });
      onRefresh();
    } catch (err: any) {
      setError(err.message || t('members.invite_failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    try {
      await apiRequest(`/trips/${tripId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId, role })
      });
      onRefresh();
    } catch (err: any) {
      showError(err, t('members.role_failed'));
    }
  };

  // One-time code for a member who forgot their PIN; the owner sends it privately
  const handleResetPin = async (member: TripMember) => {
    const ok = await confirmDialog({
      title: t('members.reset_title', { name: member.name }),
      message: t('members.reset_message'),
      confirmLabel: t('members.reset_confirm'),
    });
    if (!ok) return;
    try {
      const res = await apiRequest(`/trips/${tripId}/members/reset-code`, {
        method: 'POST',
        body: JSON.stringify({ userId: member.id })
      });
      setResetInfo({ name: member.name, code: res.code, expiresAt: res.expiresAt });
    } catch (err) {
      showError(err);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!(await confirmDialog({ message: t('members.remove_confirm'), confirmLabel: t('common.remove'), cancelLabel: t('common.cancel'), danger: true }))) return;
    try {
      await apiRequest(`/trips/${tripId}/members?userId=${userId}`, {
        method: 'DELETE'
      });
      onRefresh();
    } catch (err: any) {
      showError(err, t('members.remove_failed'));
    }
  };


  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="sheet-title">{t('members.title')}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {resetInfo && (
          <div className="card" style={{ background: 'var(--primary-soft)', borderColor: 'transparent', gap: '8px' }}>
            <span className="eyebrow">{t('members.reset_code_for', { name: resetInfo.name })}</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <strong className="tabular" style={{ fontFamily: 'var(--font-display)', fontSize: '30px', letterSpacing: '0.18em' }}>
                {resetInfo.code.slice(0, 3)} {resetInfo.code.slice(3)}
              </strong>
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(resetInfo.code);
                    showSuccess(t('members.code_copied'));
                  } catch (err) {
                    showError(err);
                  }
                }}
              >
                {t('members.copy')}
              </button>
            </div>
            <p style={{ fontSize: '13px' }}>
              {t('members.reset_instructions', {
                name: resetInfo.name,
                time: new Date(resetInfo.expiresAt).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
              })}
            </p>
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setResetInfo(null)}>
              {t('members.done')}
            </button>
          </div>
        )}

        {/* Member List */}
        <div className="list" style={{ maxHeight: '280px', overflowY: 'auto', flexShrink: 0 }}>
          {members.map((member) => (
            <div key={member.id} className="list-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={member.avatarUrl} alt={member.name} className="avatar" />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="list-title">{member.name}</span>
                  <span className="list-sub">{t(`members.${member.role}`)}</span>
                </div>
              </div>

              {/* Owner Access Controls */}
              {isOwner && member.role !== 'owner' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <select
                    className="input input-sm"
                    style={{ width: 'auto' }}
                    value={member.role}
                    onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                  >
                    <option value="editor">{t('members.editor')}</option>
                    <option value="viewer">{t('members.viewer')}</option>
                  </select>
                  <button
                    className="btn-icon"
                    onClick={() => handleResetPin(member)}
                    title={t('members.reset_pin')}
                    aria-label={t('members.reset_pin')}
                  >
                    <Icon name="key" size={16} />
                  </button>
                  <button
                    className="btn-icon danger"
                    onClick={() => handleRemove(member.id)}
                    title={t('members.remove')}
                    aria-label={t('members.remove')}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ) : member.role === 'owner' ? (
                <span className="chip chip-accent">
                  <Icon name="star" size={11} strokeWidth={2} />
                  {t('members.owner')}
                </span>
              ) : (
                <span className="chip">{t(`members.${member.role}`)}</span>
              )}
            </div>
          ))}
        </div>

        {/* Invite links (only for Trip Owners) */}
        {isOwner && (
          <section className="section">
            <span className="eyebrow">{t('members.invite_link')}</span>
            <p style={{ fontSize: '13px' }}>
              {t('members.invite_help')}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                className="input"
                value={linkRole}
                onChange={(e) => setLinkRole(e.target.value as 'editor' | 'viewer')}
              >
                <option value="editor">{t('members.can_edit_plan')}</option>
                <option value="viewer">{t('members.view_only')}</option>
              </select>
              <button type="button" className="btn btn-primary" onClick={handleCreateLink} disabled={creatingLink}>
                <Icon name="link" size={15} />
                {creatingLink ? t('members.creating') : t('members.create_link')}
              </button>
            </div>

            {invites.length > 0 && (
              <div className="list">
                {invites.map((inv) => (
                  <div key={inv.token} className="list-row">
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span className="list-title">{inv.role === 'editor' ? t('members.can_edit') : t('members.view_only')}</span>
                      <span className="list-sub">
                        {t('members.expires', { date: new Date(inv.expiresAt).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' }) })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button type="button" className="btn btn-sm" onClick={() => handleShareLink(inv.token)}>
                        {copiedToken === inv.token ? <><Icon name="check" size={14} /> {t('members.copied')}</> : t('members.share_link')}
                      </button>
                      <button
                        type="button"
                        className="btn-icon danger"
                        onClick={() => handleRevokeLink(inv.token)}
                        title={t('members.cancel_link')}
                        aria-label={t('members.cancel_link')}
                      >
                        <Icon name="x" size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Add an existing profile (only for Trip Owners) */}
        {isOwner && (
          <section className="section">
            <span className="eyebrow">{t('members.add_existing')}</span>
            {joinableUsers.length > 0 ? (
              <form onSubmit={handleInvite} className="form">
                <div className="field">
                  <label className="label">{t('members.profile')}</label>
                  <select
                    className="input"
                    value={inviteUserId}
                    onChange={(e) => setInviteUserId(e.target.value)}
                  >
                    {joinableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label">{t('members.access')}</label>
                  <select
                    className="input"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                  >
                    <option value="editor">{t('members.editor_long')}</option>
                    <option value="viewer">{t('members.viewer_long')}</option>
                  </select>
                </div>

                {error && <div className="form-error">{error}</div>}

                <div className="btn-row">
                  <button type="button" className="btn" onClick={onClose}>
                    {t('common.close')}
                  </button>
                  <button type="submit" disabled={saving} className="btn btn-primary">
                    {saving ? t('members.inviting') : t('members.add_to_trip')}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p style={{ fontSize: '13px' }}>{t('members.all_joined')}</p>
                <button className="btn btn-block" onClick={onClose}>{t('common.close')}</button>
              </>
            )}
          </section>
        )}

        {!isOwner && (
          <button className="btn btn-block" onClick={onClose}>{t('common.close')}</button>
        )}
      </div>
    </div>
  );
};

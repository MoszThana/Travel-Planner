'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/utils/api';
import { useAuth, UserProfile } from '@/context/AuthContext';
import styles from './Itinerary.module.css'; // Re-use overlay modal styling from Itinerary

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

  if (!isOpen) return null;

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
      setError(err.message || 'Failed to invite member');
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
      alert(err.message || 'Failed to update role');
    }
  };

  const handleRemove = async (userId: string) => {
    if (!window.confirm('Remove this member from the trip?')) return;
    try {
      await apiRequest(`/trips/${tripId}/members?userId=${userId}`, {
        method: 'DELETE'
      });
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member');
    }
  };

  const isOwner = userRole === 'owner';

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
        <h3 className={styles.tripTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          👥 Trip Members
        </h3>

        {/* Member List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '16px 0', maxHeight: '250px', overflowY: 'auto' }}>
          {members.map((member) => (
            <div
              key={member.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                background: 'var(--background)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={member.avatarUrl}
                  alt={member.name}
                  style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--text)' }}>
                    {member.name}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {member.role.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Owner Access Controls */}
              {isOwner && member.role !== 'owner' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select
                    value={member.role}
                    onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)'
                    }}
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    onClick={() => handleRemove(member.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px'
                    }}
                    title="Remove Member"
                  >
                    🗑️
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold', paddingRight: '8px' }}>
                  {member.role === 'owner' ? '★ Owner' : member.role.toUpperCase()}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Invite Form (only for Trip Owners) */}
        {isOwner && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
            <h4 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--text)' }}>Invite Member</h4>
            {joinableUsers.length > 0 ? (
              <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                    Select Profile
                  </label>
                  <select
                    className={styles.select}
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

                <div className={styles.formGroup}>
                  <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                    Access Level
                  </label>
                  <select
                    className={styles.select}
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                  >
                    <option value="editor">Editor (Can edit activities & days)</option>
                    <option value="viewer">Viewer (Read-only access)</option>
                  </select>
                </div>

                {error && <div style={{ color: '#ef4444', fontSize: '12px' }}>{error}</div>}

                <button
                  type="submit"
                  disabled={saving}
                  className={styles.addDayBtn}
                  style={{ background: 'var(--primary)', color: 'white', border: 'none', width: '100%', marginTop: '8px' }}
                >
                  {saving ? 'Inviting...' : 'Add to Trip'}
                </button>
              </form>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
                All available profiles are already members of this trip.
              </div>
            )}
          </div>
        )}

        <button
          className={styles.addDayBtn}
          style={{ width: '100%', marginTop: '16px' }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};

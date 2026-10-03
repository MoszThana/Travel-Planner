'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/utils/api';
import { useAuth, UserProfile } from '@/context/AuthContext';
import { Icon } from './Icon';

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
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="sheet-title">Trip members</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Member List */}
        <div className="list" style={{ maxHeight: '280px', overflowY: 'auto', flexShrink: 0 }}>
          {members.map((member) => (
            <div key={member.id} className="list-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={member.avatarUrl} alt={member.name} className="avatar" />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="list-title">{member.name}</span>
                  <span className="list-sub" style={{ textTransform: 'capitalize' }}>{member.role}</span>
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
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    className="btn-icon danger"
                    onClick={() => handleRemove(member.id)}
                    title="Remove member"
                    aria-label="Remove member"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ) : member.role === 'owner' ? (
                <span className="chip chip-accent">
                  <Icon name="star" size={11} strokeWidth={2} />
                  Owner
                </span>
              ) : (
                <span className="chip" style={{ textTransform: 'capitalize' }}>{member.role}</span>
              )}
            </div>
          ))}
        </div>

        {/* Invite Form (only for Trip Owners) */}
        {isOwner && (
          <section className="section">
            <span className="eyebrow">Invite member</span>
            {joinableUsers.length > 0 ? (
              <form onSubmit={handleInvite} className="form">
                <div className="field">
                  <label className="label">Profile</label>
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
                  <label className="label">Access</label>
                  <select
                    className="input"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                  >
                    <option value="editor">Editor — can edit activities and days</option>
                    <option value="viewer">Viewer — read only</option>
                  </select>
                </div>

                {error && <div className="form-error">{error}</div>}

                <div className="btn-row">
                  <button type="button" className="btn" onClick={onClose}>
                    Close
                  </button>
                  <button type="submit" disabled={saving} className="btn btn-primary">
                    {saving ? 'Inviting…' : 'Add to trip'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p style={{ fontSize: '13px' }}>Everyone with a profile is already on this trip.</p>
                <button className="btn btn-block" onClick={onClose}>Close</button>
              </>
            )}
          </section>
        )}

        {!isOwner && (
          <button className="btn btn-block" onClick={onClose}>Close</button>
        )}
      </div>
    </div>
  );
};

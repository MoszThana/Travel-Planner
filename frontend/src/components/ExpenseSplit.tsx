'use client';

import React, { useState } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/utils/api';
import styles from './Itinerary.module.css'; // sharing modal overlays
import localStyles from './ExpenseSplit.module.css';

interface ExpenseSplitProps {
  trip: any;
  onRefresh: () => void;
  userRole?: string;
}

export const ExpenseSplit: React.FC<ExpenseSplitProps> = ({ trip, onRefresh, userRole = 'editor' }) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [showAddForm, setShowAddForm] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState(user?.id || '');
  const [category, setCategory] = useState('food');
  const [splitType, setSplitType] = useState('equal'); // 'equal' | 'custom'
  
  // Custom splits specific inputs
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  // Checkbox select for who shares
  const [sharesCheck, setSharesCheck] = useState<Record<string, boolean>>(
    trip.members ? trip.members.reduce((acc: any, m: any) => ({ ...acc, [m.id]: true }), {}) : {}
  );

  // Suggestions state (mock collaboration queue)
  const [suggestions, setSuggestions] = useState<any[]>([]);

  // 1. Calculate Balances & Debt Settlements
  const members = trip.members || [];
  const expenses = trip.expenses || [];
  const splits = trip.splits || [];

  const balances: Record<string, number> = {};
  members.forEach((m: any) => { balances[m.id] = 0; });

  // Accumulate paid amounts vs split amounts
  expenses.forEach((exp: any) => {
    if (exp.payerId in balances) {
      balances[exp.payerId] += exp.amount;
    }
    const expSplits = splits.filter((s: any) => s.expenseId === exp.id);
    expSplits.forEach((sp: any) => {
      if (sp.userId in balances) {
        balances[sp.userId] -= sp.amount;
      }
    });
  });

  // Debt Simplification Algorithm
  const debtors: { userId: string; balance: number }[] = [];
  const creditors: { userId: string; balance: number }[] = [];

  Object.entries(balances).forEach(([userId, bal]) => {
    if (bal < -0.01) {
      debtors.push({ userId, balance: bal });
    } else if (bal > 0.01) {
      creditors.push({ userId, balance: bal });
    }
  });

  // Sort debtors ascending (most negative first) and creditors descending (most positive first)
  debtors.sort((a, b) => a.balance - b.balance);
  creditors.sort((a, b) => b.balance - a.balance);

  const settlements: { from: string; to: string; amount: number }[] = [];
  let dIdx = 0;
  let cIdx = 0;

  // Copy values to manipulate
  const tempDebtors = debtors.map(d => ({ ...d }));
  const tempCreditors = creditors.map(c => ({ ...c }));

  while (dIdx < tempDebtors.length && cIdx < tempCreditors.length) {
    const debtor = tempDebtors[dIdx];
    const creditor = tempCreditors[cIdx];

    const debtVal = Math.abs(debtor.balance);
    const creditVal = creditor.balance;

    const settleVal = Math.min(debtVal, creditVal);
    if (settleVal > 0.01) {
      settlements.push({
        from: debtor.userId,
        to: creditor.userId,
        amount: settleVal
      });
    }

    debtor.balance += settleVal;
    creditor.balance -= settleVal;

    if (Math.abs(debtor.balance) < 0.01) dIdx++;
    if (creditor.balance < 0.01) cIdx++;
  }

  // Handle new payment entry submission
  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount || !payerId) return;

    const totalAmount = parseFloat(amount);
    const selectedMembers = Object.entries(sharesCheck)
      .filter(([_, checked]) => checked)
      .map(([mid]) => mid);

    if (selectedMembers.length === 0) {
      alert('Select at least one member to share the expense.');
      return;
    }

    // Prepare splits list
    let splitPayload: { userId: string; amount: number }[] = [];

    if (splitType === 'equal') {
      const share = totalAmount / selectedMembers.length;
      splitPayload = selectedMembers.map(userId => ({
        userId,
        amount: parseFloat(share.toFixed(2))
      }));
    } else {
      // Validate custom split sum equals total
      let customSum = 0;
      splitPayload = selectedMembers.map(userId => {
        const val = parseFloat(customSplits[userId]) || 0;
        customSum += val;
        return { userId, amount: val };
      });

      if (Math.abs(customSum - totalAmount) > 1) {
        alert(`Error: The sum of custom split amounts (${customSum.toLocaleString()} THB) must equal the total expense amount (${totalAmount.toLocaleString()} THB).`);
        return;
      }
    }

    const payload = {
      tripId: trip.id,
      payerId,
      amount: totalAmount,
      description,
      category,
      splitType,
      splits: splitPayload
    };

    // If user is owner (Maru), commit directly. Otherwise, place in collaborative queue!
    const isOwner = user?.id === trip.ownerId;

    if (isOwner) {
      try {
        await apiRequest('/expenses', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } catch {
        // Offline fallback
        const offlineTrips = JSON.parse(localStorage.getItem('offline_trips') || '[]');
        const offlineTrip = offlineTrips.find((t: any) => t.id === trip.id);
        if (offlineTrip) {
          const expId = `exp-${Date.now()}`;
          offlineTrip.expenses.push({
            id: expId,
            tripId: trip.id,
            payerId,
            amount: totalAmount,
            description,
            category,
            splitType,
            createdAt: Date.now()
          });
          splitPayload.forEach(sp => {
            offlineTrip.splits.push({
              id: `split-${Date.now()}-${Math.random()}`,
              expenseId: expId,
              userId: sp.userId,
              amount: sp.amount
            });
          });
          localStorage.setItem('offline_trips', JSON.stringify(offlineTrips));
        }
      }
      onRefresh();
    } else {
      // Non-owner: suggest expense instead (collaboration rule)
      const newSuggestion = {
        id: `sug-${Date.now()}`,
        suggestedBy: user?.name || 'Guest',
        payload
      };
      setSuggestions(prev => [...prev, newSuggestion]);
      alert('Your group expense has been sent as a suggestion to the trip owner for approval!');
    }

    setDescription('');
    setAmount('');
    setPayerId(user?.id || '');
    setCustomSplits({});
    setShowAddForm(false);
  };

  const handleApproveSuggestion = async (sugId: string, payload: any) => {
    try {
      await apiRequest('/expenses', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch {
      // Offline direct commit
      const offlineTrips = JSON.parse(localStorage.getItem('offline_trips') || '[]');
      const offlineTrip = offlineTrips.find((t: any) => t.id === trip.id);
      if (offlineTrip) {
        const expId = `exp-${Date.now()}`;
        offlineTrip.expenses.push({
          id: expId,
          tripId: trip.id,
          payerId: payload.payerId,
          amount: payload.amount,
          description: payload.description,
          category: payload.category,
          splitType: payload.splitType,
          createdAt: Date.now()
        });
        payload.splits.forEach((sp: any) => {
          offlineTrip.splits.push({
            id: `split-${Date.now()}-${Math.random()}`,
            expenseId: expId,
            userId: sp.userId,
            amount: sp.amount
          });
        });
        localStorage.setItem('offline_trips', JSON.stringify(offlineTrips));
      }
    }
    setSuggestions(prev => prev.filter(s => s.id !== sugId));
    onRefresh();
  };

  const getUserName = (id: string) => {
    const found = members.find((m: any) => m.id === id);
    return found ? found.name : id;
  };

  const getUserAvatar = (id: string) => {
    const found = members.find((m: any) => m.id === id);
    return found ? found.avatarUrl : 'https://api.dicebear.com/7.x/adventurer/svg';
  };

  const isOwner = user?.id === trip.ownerId;

  return (
    <div className={localStyles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className={localStyles.title}>{t('group.title')}</h2>
        {userRole !== 'viewer' && (
          <button className={localStyles.approveBtn} style={{ flex: 'unset', padding: '8px 12px' }} onClick={() => setShowAddForm(true)}>
            + Record Cost
          </button>
        )}
      </div>

      {/* Members Section */}
      <div className={localStyles.sectionCard}>
        <span className={localStyles.cardTitle}>{t('group.members')}</span>
        <div className={localStyles.memberList}>
          {members.map((m: any) => (
            <div key={m.id} className={localStyles.memberItem}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.avatarUrl} alt={m.name} className={localStyles.memberAvatar} style={{ borderColor: m.role === 'owner' ? 'var(--primary)' : 'var(--border)' }} />
              <span className={localStyles.memberName}>{m.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Owner Approvals Queue Panel */}
      {isOwner && suggestions.length > 0 && (
        <div className={localStyles.sectionCard} style={{ background: 'rgba(6, 182, 212, 0.02)' }}>
          <span className={localStyles.cardTitle} style={{ color: 'var(--secondary)' }}>📋 Pending Suggestions ({suggestions.length})</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {suggestions.map((sug) => (
              <div key={sug.id} className={localStyles.approvalCard}>
                <div className={localStyles.approvalHeader}>
                  <strong style={{ fontSize: '13px' }}>{sug.payload.description}</strong>
                  <span className={localStyles.suggestedBy}>Suggested by: {sug.suggestedBy}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Payer: {getUserName(sug.payload.payerId)} | Amount: {sug.payload.amount} THB
                </div>
                <div className={localStyles.actionRow}>
                  <button className={localStyles.approveBtn} onClick={() => handleApproveSuggestion(sug.id, sug.payload)}>
                    Approve & Commit
                  </button>
                  <button className={localStyles.rejectBtn} onClick={() => setSuggestions(prev => prev.filter(s => s.id !== sug.id))}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debt Settlement Summary */}
      <div className={localStyles.sectionCard}>
        <span className={localStyles.cardTitle}>{t('group.who_owes_whom')}</span>
        <div className={localStyles.debtList}>
          {settlements.length === 0 ? (
            <p style={{ textAlign: 'center', fontSize: '12px', padding: '16px 0', color: 'var(--text-muted)' }}>
              🎉 {t('group.no_debts')}
            </p>
          ) : (
            settlements.map((set, idx) => (
              <div key={idx} className={localStyles.debtItem}>
                <div className={localStyles.debtActor}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getUserAvatar(set.from)} alt="" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                  <span>{getUserName(set.from)}</span>
                  <span className={localStyles.debtArrow}>➜</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getUserAvatar(set.to)} alt="" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                  <span>{getUserName(set.to)}</span>
                </div>
                <span className={localStyles.debtAmount}>{Math.round(set.amount).toLocaleString()} THB</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Expense Drawer */}
      {showAddForm && (
        <div className={styles.modalOverlay} onClick={() => setShowAddForm(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={localStyles.cardTitle} style={{ fontSize: '16px' }}>Record Shared Expense</h3>
            <form onSubmit={handleAddExpenseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className={styles.formGroup}>
                <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                  Description / Activity
                </label>
                <input
                  type="text"
                  required
                  className={styles.textarea}
                  style={{ minHeight: 'unset' }}
                  placeholder="e.g., Dinner at Shibuya"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                    Total Amount (THB)
                  </label>
                  <input
                    type="number"
                    required
                    className={styles.textarea}
                    style={{ minHeight: 'unset' }}
                    placeholder="Total cost"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                    Paid By
                  </label>
                  <select
                    className={styles.select}
                    value={payerId}
                    onChange={(e) => setPayerId(e.target.value)}
                  >
                    {members.map((m: any) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                    Category
                  </label>
                  <select
                    className={styles.select}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="food">Food</option>
                    <option value="transport">Transport</option>
                    <option value="hotel">Accommodation</option>
                    <option value="activity">Tickets</option>
                    <option value="shopping">Shopping</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                    Split Scheme
                  </label>
                  <select
                    className={styles.select}
                    value={splitType}
                    onChange={(e) => setSplitType(e.target.value)}
                  >
                    <option value="equal">{t('group.equal_split')}</option>
                    <option value="custom">{t('group.custom_split')}</option>
                  </select>
                </div>
              </div>

              {/* Share checklist */}
              <div className={styles.formGroup}>
                <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                  Shared By (Select Members)
                </label>
                <div className={localStyles.checkboxGrid}>
                  {members.map((m: any) => {
                    const isChecked = !!sharesCheck[m.id];
                    return (
                      <div key={m.id} className={localStyles.checkboxItem}>
                        <label className={localStyles.checkboxLabel}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={isChecked}
                            onChange={(e) => setSharesCheck(prev => ({ ...prev, [m.id]: e.target.checked }))}
                          />
                          <span>{m.name}</span>
                        </label>

                        {/* Custom amount field if Custom Split is selected */}
                        {splitType === 'custom' && isChecked && (
                          <input
                            type="number"
                            placeholder="THB"
                            className={localStyles.customSplitInput}
                            value={customSplits[m.id] || ''}
                            onChange={(e) => setCustomSplits(prev => ({ ...prev, [m.id]: e.target.value }))}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="submit" className={styles.addDayBtn} style={{ flex: 2, background: 'var(--primary)', color: 'white', border: 'none' }}>
                  {t('common.save')}
                </button>
                <button type="button" className={styles.addDayBtn} style={{ flex: 1 }} onClick={() => setShowAddForm(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

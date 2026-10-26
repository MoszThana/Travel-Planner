'use client';

import React, { useState } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, showError } from '@/utils/api';
import { formatMoney } from '@/utils/money';
import { Icon } from './Icon';
import { confirmDialog } from './Feedback';
import localStyles from './ExpenseSplit.module.css';

interface ExpenseSplitProps {
  trip: any;
  onRefresh: () => void;
  userRole?: string;
}

export const ExpenseSplit: React.FC<ExpenseSplitProps> = ({ trip, onRefresh, userRole = 'editor' }) => {
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  const canEdit = userRole === 'owner' || userRole === 'editor';
  const currency = trip.currency || 'THB';
  const money = (value: number) => formatMoney(value, currency, locale);

  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState(user?.id || '');
  const [category, setCategory] = useState('food');
  const [splitType, setSplitType] = useState('equal'); // 'equal' | 'custom'

  // Custom split amounts per member
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  // Who shares the cost (everyone by default)
  const [sharesCheck, setSharesCheck] = useState<Record<string, boolean>>(
    trip.members ? trip.members.reduce((acc: any, m: any) => ({ ...acc, [m.id]: true }), {}) : {}
  );

  // 1. Calculate Balances & Debt Settlements
  const members = trip.members || [];
  const expenses = [...(trip.expenses || [])].sort((a: any, b: any) => b.createdAt - a.createdAt);
  const splits = trip.splits || [];

  const balances: Record<string, number> = {};
  members.forEach((m: any) => { balances[m.id] = 0; });

  // Accumulate paid amounts vs split amounts
  expenses.forEach((exp: any) => {
    if (exp.payerId in balances) {
      balances[exp.payerId] += exp.amount;
    }
    splits.filter((s: any) => s.expenseId === exp.id).forEach((sp: any) => {
      if (sp.userId in balances) {
        balances[sp.userId] -= sp.amount;
      }
    });
  });

  // Debt simplification: match the biggest debtors with the biggest creditors
  const debtors = Object.entries(balances)
    .filter(([, bal]) => bal < -0.01)
    .map(([userId, balance]) => ({ userId, balance }))
    .sort((a, b) => a.balance - b.balance);
  const creditors = Object.entries(balances)
    .filter(([, bal]) => bal > 0.01)
    .map(([userId, balance]) => ({ userId, balance }))
    .sort((a, b) => b.balance - a.balance);

  const settlements: { from: string; to: string; amount: number }[] = [];
  let dIdx = 0;
  let cIdx = 0;
  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const settleVal = Math.min(Math.abs(debtor.balance), creditor.balance);
    if (settleVal > 0.01) {
      settlements.push({ from: debtor.userId, to: creditor.userId, amount: settleVal });
    }
    debtor.balance += settleVal;
    creditor.balance -= settleVal;
    if (Math.abs(debtor.balance) < 0.01) dIdx++;
    if (creditor.balance < 0.01) cIdx++;
  }

  const totalSpent = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setPayerId(user?.id || '');
    setCustomSplits({});
    setFormError('');
    setShowAddForm(false);
  };

  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!description || !amount || !payerId) return;

    const totalAmount = parseFloat(amount);
    if (!(totalAmount > 0)) {
      setFormError(t('group.need_amount'));
      return;
    }
    const selectedMembers = Object.entries(sharesCheck)
      .filter(([, checked]) => checked)
      .map(([mid]) => mid)
      .filter((mid) => members.some((m: any) => m.id === mid));

    if (selectedMembers.length === 0) {
      setFormError(t('group.need_people'));
      return;
    }

    let splitPayload: { userId: string; amount: number }[];
    if (splitType === 'equal') {
      // Split in cents so the shares add up exactly to the total
      const cents = Math.round(totalAmount * 100);
      const base = Math.floor(cents / selectedMembers.length);
      const remainder = cents - base * selectedMembers.length;
      splitPayload = selectedMembers.map((userId, i) => ({
        userId,
        amount: (base + (i < remainder ? 1 : 0)) / 100
      }));
    } else {
      splitPayload = selectedMembers.map(userId => ({ userId, amount: parseFloat(customSplits[userId]) || 0 }));
      const customSum = splitPayload.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(customSum - totalAmount) > 0.01) {
        setFormError(t('group.custom_mismatch', { sum: money(customSum), total: money(totalAmount) }));
        return;
      }
    }

    setSaving(true);
    try {
      await apiRequest('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          tripId: trip.id,
          payerId,
          amount: totalAmount,
          description,
          category,
          splitType,
          splits: splitPayload
        })
      });
      resetForm();
      onRefresh();
    } catch (err: any) {
      setFormError(err?.message || t('group.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (exp: any) => {
    if (!(await confirmDialog({ title: t('group.delete_title'), message: `"${exp.description}" · ${money(exp.amount)}`, confirmLabel: t('common.delete'), cancelLabel: t('common.cancel'), danger: true }))) return;
    try {
      await apiRequest(`/expenses/${exp.id}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) {
      showError(err, t('group.delete_failed'));
    }
  };

  const getUserName = (id: string) => members.find((m: any) => m.id === id)?.name || t('group.former_member');
  const getUserAvatar = (id: string) =>
    members.find((m: any) => m.id === id)?.avatarUrl || 'https://api.dicebear.com/7.x/adventurer/svg';

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('group.title')}</h1>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(true)}>
            <Icon name="plus" size={16} />
            {t('group.add_expense')}
          </button>
        )}
      </div>

      <div className="split">
      <div className="stack">
      {/* Members */}
      <section className="section">
        <span className="eyebrow">{t('group.members')} · {members.length}</span>
        <div className={localStyles.memberList}>
          {members.map((m: any) => (
            <div key={m.id} className={localStyles.memberItem}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.avatarUrl}
                alt={m.name}
                className={`${localStyles.memberAvatar} ${m.role === 'owner' ? localStyles.memberAvatarOwner : ''}`}
              />
              <span className={localStyles.memberName}>{m.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Debt Settlement Summary */}
      <section className="section">
        <span className="eyebrow">{t('group.who_owes_whom')}</span>
        {settlements.length === 0 ? (
          <div className={`card ${localStyles.settled}`}>
            <Icon name="check" size={18} />
            {expenses.length === 0 ? t('group.empty') : t('group.no_debts')}
          </div>
        ) : (
          <div className="list">
            {settlements.map((set, idx) => (
              <div key={idx} className="list-row">
                <div className={localStyles.debtActor}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getUserAvatar(set.from)} alt="" className="avatar avatar-sm" />
                  <span>{getUserName(set.from)}</span>
                  <Icon name="arrowRight" size={14} className={localStyles.debtArrow} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getUserAvatar(set.to)} alt="" className="avatar avatar-sm" />
                  <span>{getUserName(set.to)}</span>
                </div>
                <span className={localStyles.debtAmount}>{money(set.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>

      <div className="stack">
      {/* Recorded expenses */}
      <section className="section">
        <div className="section-head">
          <span className="eyebrow">{t('group.expenses', { count: expenses.length })}</span>
          {expenses.length > 0 && <span className="muted tabular" style={{ fontSize: '13px' }}>{t('group.total', { amount: money(totalSpent) })}</span>}
        </div>
        {expenses.length === 0 ? (
          <div className="empty">
            <Icon name="wallet" size={26} />
            {canEdit ? t('group.empty_editor') : t('group.empty')}
          </div>
        ) : (
          <div className="list">
            {expenses.map((exp: any) => {
              const sharedBy = splits.filter((s: any) => s.expenseId === exp.id).length;
              return (
                <div key={exp.id} className="list-row">
                  <div className={localStyles.expenseText}>
                    <span className="list-title">{exp.description}</span>
                    <span className="list-sub">
                      {t('group.paid_split', { name: getUserName(exp.payerId), count: sharedBy, date: new Date(exp.createdAt).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' }) })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className={localStyles.debtAmount}>{money(exp.amount)}</span>
                    {canEdit && (
                      <button className="btn-icon danger" onClick={() => handleDeleteExpense(exp)} aria-label={t('group.delete_expense')}>
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      </div>
      </div>

      {/* Add Expense Sheet */}
      {showAddForm && (
        <div className="sheet-overlay" onClick={resetForm}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2 className="sheet-title">{t('group.new_title')}</h2>
              <button type="button" className="btn-icon" onClick={resetForm} aria-label={t('common.cancel')}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <form onSubmit={handleAddExpenseSubmit} className="form">
              <div className="field">
                <label className="label">{t('group.description')}</label>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder={t('group.description_placeholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="field-row">
                <div className="field">
                  <label className="label">{t('group.amount_label', { currency })}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    required
                    className="input"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="label">{t('group.paid_by')}</label>
                  <select
                    className="input"
                    value={payerId}
                    onChange={(e) => setPayerId(e.target.value)}
                  >
                    {members.map((m: any) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label className="label">{t('group.category')}</label>
                  <select
                    className="input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="food">{t('budget.categories.food')}</option>
                    <option value="transport">{t('budget.categories.transport')}</option>
                    <option value="hotel">{t('budget.categories.hotel')}</option>
                    <option value="activity">{t('budget.categories.activity')}</option>
                    <option value="shopping">{t('budget.categories.shopping')}</option>
                    <option value="other">{t('budget.categories.other')}</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">{t('group.split')}</label>
                  <select
                    className="input"
                    value={splitType}
                    onChange={(e) => setSplitType(e.target.value)}
                  >
                    <option value="equal">{t('group.equal_split')}</option>
                    <option value="custom">{t('group.custom_split')}</option>
                  </select>
                </div>
              </div>

              {/* Share checklist */}
              <div className="field">
                <label className="label">
                  {t('group.shared_by')}
                  <button
                    type="button"
                    className={localStyles.linkButton}
                    onClick={() => {
                      const allOn = members.every((m: any) => sharesCheck[m.id]);
                      setSharesCheck(members.reduce((acc: any, m: any) => ({ ...acc, [m.id]: !allOn }), {}));
                    }}
                  >
                    {members.every((m: any) => sharesCheck[m.id]) ? t('group.clear_all') : t('group.select_all')}
                  </button>
                </label>
                <div className="list">
                  {members.map((m: any) => {
                    const isChecked = !!sharesCheck[m.id];
                    return (
                      <div key={m.id} className={`list-row ${localStyles.checkboxItem}`}>
                        <label className={localStyles.checkboxLabel}>
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={isChecked}
                            onChange={(e) => setSharesCheck(prev => ({ ...prev, [m.id]: e.target.checked }))}
                          />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.avatarUrl} alt="" className="avatar avatar-sm" />
                          <span>{m.name}</span>
                        </label>

                        {splitType === 'custom' && isChecked && (
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder={currency}
                            className={`input input-sm tabular ${localStyles.customSplitInput}`}
                            value={customSplits[m.id] || ''}
                            onChange={(e) => setCustomSplits(prev => ({ ...prev, [m.id]: e.target.value }))}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {formError && <div className="form-error">{formError}</div>}

              <div className="btn-row">
                <button type="button" className="btn" onClick={resetForm}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

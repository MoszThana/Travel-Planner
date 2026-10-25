'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { apiRequest, showError } from '@/utils/api';
import { formatMoney, CURRENCIES } from '@/utils/money';
import styles from './BudgetTracker.module.css';
import { CountUp } from './Motion';
import { Gauge, DayChart, DayPoint } from './Charts';

interface BudgetTrackerProps {
  trip: any;
  onRefresh: () => void;
  userRole?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  food: 'var(--cat-food)',
  transport: 'var(--cat-transport)',
  hotel: 'var(--cat-hotel)',
  activity: 'var(--cat-activity)',
  shopping: 'var(--cat-shopping)',
  emergency: 'var(--cat-emergency)',
  other: 'var(--cat-other)'
};

export const BudgetTracker: React.FC<BudgetTrackerProps> = ({ trip, onRefresh, userRole = 'editor' }) => {
  const { t, locale } = useTranslation();
  const canEdit = userRole === 'owner' || userRole === 'editor';
  const currency = trip.currency || 'THB';
  const money = (value: number) => formatMoney(value, currency, locale);

  // Budget target is shared by the whole group (saved on the trip)
  const targetBudget: number = trip.budget ?? 0;
  const [budgetInput, setBudgetInput] = useState(trip.budget != null ? String(trip.budget) : '');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setBudgetInput(trip.budget != null ? String(trip.budget) : '');
  }, [trip.budget]);

  const saveSettings = async (updates: { budget?: number | null; currency?: string }) => {
    setSavingSettings(true);
    try {
      await apiRequest(`/trips/${trip.id}`, { method: 'PATCH', body: JSON.stringify(updates) });
      onRefresh();
    } catch (err) {
      showError(err, "Couldn't save the budget.");
      setBudgetInput(trip.budget != null ? String(trip.budget) : '');
    } finally {
      setSavingSettings(false);
    }
  };

  const commitBudget = () => {
    const value = budgetInput.trim() === '' ? null : Number(budgetInput);
    if (value === (trip.budget ?? null)) return;
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setBudgetInput(trip.budget != null ? String(trip.budget) : '');
      return;
    }
    saveSettings({ budget: value });
  };

  // 1. Calculate Activity Totals
  let totalEst = 0;
  let totalAct = 0;
  const categoryTotals: Record<string, number> = {
    food: 0, transport: 0, hotel: 0, activity: 0, shopping: 0, emergency: 0, other: 0
  };

  if (trip.activities) {
    trip.activities.forEach((act: any) => {
      totalEst += act.estCost || 0;
      totalAct += act.actCost || 0;
      const cat = act.costCategory || 'other';
      if (cat in categoryTotals) {
        categoryTotals[cat] += act.actCost || act.estCost || 0; // Use actual if spent, else est
      } else {
        categoryTotals.other += act.actCost || act.estCost || 0;
      }
    });
  }

  // 2. Add Group Expenses totals (to capture any direct group payments)
  if (trip.expenses) {
    trip.expenses.forEach((exp: any) => {
      totalAct += exp.amount || 0;
      const cat = exp.category || 'other';
      if (cat in categoryTotals) {
        categoryTotals[cat] += exp.amount || 0;
      } else {
        categoryTotals.other += exp.amount || 0;
      }
    });
  }

  const daysCount = trip.days ? trip.days.length : 1;
  const membersCount = trip.members ? trip.members.length : 1;

  const costPerDay = totalAct / daysCount;
  const costPerPerson = totalAct / membersCount;
  const hasBudget = targetBudget > 0;
  const remaining = targetBudget - totalAct;
  const isOverBudget = hasBudget && remaining < 0;

  // Category shares are of the category total (spent, or planned where nothing is spent yet)
  const categorySum = Object.values(categoryTotals).reduce((sum, v) => sum + v, 0);

  // Planned vs spent per day, from activity costs (group expenses have no day)
  const dayData: DayPoint[] = (trip.days || []).map((d: any) => {
    const acts = (trip.activities || []).filter((a: any) => a.dayId === d.id);
    return {
      label: t('itinerary.day', { number: d.dayNumber }),
      sublabel: new Date(d.date).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' }),
      planned: acts.reduce((sum: number, a: any) => sum + (a.estCost || 0), 0),
      spent: acts.reduce((sum: number, a: any) => sum + (a.actCost || 0), 0),
    };
  });
  const hasDayCosts = dayData.some((d) => d.planned > 0 || d.spent > 0);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('budget.title')}</h1>
        <label className={styles.targetField}>
          Currency
          <select
            className="input input-sm"
            style={{ width: 'auto' }}
            value={currency}
            disabled={!canEdit || savingSettings}
            onChange={(e) => saveSettings({ currency: e.target.value })}
            title={canEdit ? 'Currency for this trip' : 'Only editors can change the currency'}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} · {c.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="split">
      {/* Summary */}
      <div className={`card lift ${styles.summaryCard}`}>
        <div className={styles.gaugeHeader}>
          <span className="eyebrow">{t('budget.actual_spent')}</span>
          <CountUp value={totalAct} format={money} className={styles.gaugeValue} />
        </div>

        {hasBudget && (
          <Gauge value={totalAct} max={targetBudget} caption={`of ${money(targetBudget)} budget`} />
        )}

        <div className={styles.targetRow}>
          <span>{hasBudget ? 'Group budget for the whole trip' : 'Set a budget for the whole group'}</span>
          <label className={styles.targetField}>
            Budget
            <input
              type="number"
              inputMode="decimal"
              min="0"
              className="input input-sm tabular"
              placeholder="0"
              value={budgetInput}
              disabled={!canEdit || savingSettings}
              onChange={(e) => setBudgetInput(e.target.value)}
              onBlur={commitBudget}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </label>
        </div>

        <div className={styles.spentStats}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('budget.remaining')}</span>
            {hasBudget
              ? <CountUp value={remaining} format={money} className={`${styles.statValue} ${isOverBudget ? styles.statNegative : styles.statPositive}`} />
              : <span className={styles.statValue}>—</span>}
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Planned</span>
            <CountUp value={totalEst} format={money} className={styles.statValue} />
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('budget.daily_average')}</span>
            <CountUp value={Math.round(costPerDay)} format={money} className={styles.statValue} />
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('budget.cost_per_person')}</span>
            <CountUp value={Math.round(costPerPerson)} format={money} className={styles.statValue} />
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <section className="section">
        <span className="eyebrow">By category · spent, or planned if not paid yet</span>
        <div className="list lift">
          {Object.entries(categoryTotals).map(([cat, amount]) => {
            const catPercent = categorySum > 0 ? (amount / categorySum) * 100 : 0;
            const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;

            return (
              <div key={cat} className={`list-row ${styles.categoryItem}`}>
                <div className={styles.itemLabelRow}>
                  <span className={styles.catIconName}>
                    <span className={styles.colorDot} style={{ backgroundColor: color }} />
                    {t(`budget.categories.${cat}`)}
                  </span>
                  <span className={styles.itemAmount}>
                    {money(amount)}
                    <span className={styles.itemPercent}>{Math.round(catPercent)}%</span>
                  </span>
                </div>
                <div className={styles.catProgress}>
                  <div
                    className={styles.catFill}
                    style={{ width: `${catPercent}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
      </div>

      {/* Planned vs spent per day */}
      <section className="section">
        <span className="eyebrow">Per day · activity costs</span>
        <div className="card lift">
          {hasDayCosts ? (
            <DayChart data={dayData} format={money} />
          ) : (
            <p style={{ fontSize: '14px' }}>
              Add estimated costs to activities (and the real amount when you check in) to see planned vs spent for each day.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

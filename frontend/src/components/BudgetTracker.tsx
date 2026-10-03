'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import styles from './BudgetTracker.module.css';

interface BudgetTrackerProps {
  trip: any;
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

export const BudgetTracker: React.FC<BudgetTrackerProps> = ({ trip, userRole = 'editor' }) => {
  const { t } = useTranslation();
  const [targetBudget, setTargetBudget] = useState(50000); // Default target budget

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`budget_target_${trip.id}`);
      if (saved) {
        setTargetBudget(parseFloat(saved));
      }
    }
  }, [trip.id]);

  const handleTargetChange = (val: string) => {
    const num = parseFloat(val) || 0;
    setTargetBudget(num);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`budget_target_${trip.id}`, String(num));
    }
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
  const remaining = targetBudget - totalAct;
  const isOverBudget = remaining < 0;
  
  // Progress Bar percentage
  const percent = Math.min((totalAct / targetBudget) * 100, 100);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('budget.title')}</h1>
      </div>

      <div className="split">
      {/* Summary */}
      <div className={`card ${styles.summaryCard}`}>
        <div className={styles.gaugeHeader}>
          <span className="eyebrow">{t('budget.actual_spent')}</span>
          <span className={styles.gaugeValue}>
            {totalAct.toLocaleString()}
            <span className={styles.currency}>THB</span>
          </span>
        </div>

        <div className={styles.progressBar}>
          <div
            className={`${styles.progressFill} ${isOverBudget ? styles.progressFillAlert : ''}`}
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className={styles.targetRow}>
          <span>{targetBudget > 0 ? Math.round(percent) : 0}% of target</span>
          <label className={styles.targetField}>
            Target
            <input
              type="number"
              className="input input-sm tabular"
              value={targetBudget}
              disabled={userRole === 'viewer'}
              onChange={(e) => handleTargetChange(e.target.value)}
            />
          </label>
        </div>

        <div className={styles.spentStats}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('budget.remaining')}</span>
            <span className={`${styles.statValue} ${isOverBudget ? styles.statNegative : styles.statPositive}`}>
              {remaining.toLocaleString()}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Planned</span>
            <span className={styles.statValue}>{totalEst.toLocaleString()}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('budget.daily_average')}</span>
            <span className={styles.statValue}>{Math.round(costPerDay).toLocaleString()}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('budget.cost_per_person')}</span>
            <span className={styles.statValue}>{Math.round(costPerPerson).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <section className="section">
        <span className="eyebrow">By category</span>
        <div className="list">
          {Object.entries(categoryTotals).map(([cat, amount]) => {
            const catPercent = totalAct > 0 ? (amount / totalAct) * 100 : 0;
            const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;

            return (
              <div key={cat} className={`list-row ${styles.categoryItem}`}>
                <div className={styles.itemLabelRow}>
                  <span className={styles.catIconName}>
                    <span className={styles.colorDot} style={{ backgroundColor: color }} />
                    {t(`budget.categories.${cat}`)}
                  </span>
                  <span className={styles.itemAmount}>
                    {amount.toLocaleString()}
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
    </div>
  );
};

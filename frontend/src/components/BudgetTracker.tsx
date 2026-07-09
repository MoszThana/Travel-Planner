'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import styles from './BudgetTracker.module.css';

interface BudgetTrackerProps {
  trip: any;
  userRole?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  food: '#f97316',      // Orange
  transport: '#3b82f6', // Blue
  hotel: '#a855f7',     // Purple
  activity: '#10b981',  // Green
  shopping: '#ec4899',  // Pink
  emergency: '#f43f5e', // Red
  other: '#64748b'      // Gray
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
    <div className={styles.container}>
      <h2 className={styles.title}>{t('budget.title')}</h2>

      {/* Target Input Card */}
      <div className={styles.summaryCard} style={{ padding: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)' }}>Set Target Budget:</span>
          <input
            type="number"
            value={targetBudget}
            disabled={userRole === 'viewer'}
            onChange={(e) => handleTargetChange(e.target.value)}
            style={{ width: '120px', padding: '6px', border: '1px solid var(--border)', borderRadius: '6px', textAlign: 'right', fontWeight: '700' }}
          />
        </div>
      </div>

      {/* Summary Card Details */}
      <div className={styles.summaryCard}>
        <div className={styles.gaugeHeader}>
          <span className={styles.gaugeTitle}>{t('budget.actual_spent')}</span>
          <span className={styles.gaugeValue}>{totalAct.toLocaleString()} THB</span>
        </div>

        {/* Progress Bar comparing actual vs target */}
        <div className={styles.progressBar}>
          <div 
            className={`${styles.progressFill} ${isOverBudget ? styles.progressFillAlert : ''}`} 
            style={{ width: `${percent}%` }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>
          <span>0%</span>
          <span>Target: {targetBudget.toLocaleString()} THB</span>
        </div>

        {/* Breakdown Stats */}
        <div className={styles.spentStats}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('budget.remaining')}</span>
            <span className={styles.statValue} style={{ color: isOverBudget ? 'var(--accent)' : '#22c55e' }}>
              {remaining.toLocaleString()} THB
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Est. Planned Budget</span>
            <span className={styles.statValue}>{totalEst.toLocaleString()} THB</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('budget.daily_average')}</span>
            <span className={styles.statValue}>{Math.round(costPerDay).toLocaleString()} THB</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{t('budget.cost_per_person')}</span>
            <span className={styles.statValue}>{Math.round(costPerPerson).toLocaleString()} THB</span>
          </div>
        </div>
      </div>

      {/* Category Breakdown Card */}
      <div className={styles.categoryCard}>
        <h3 className={styles.categoryTitle}>Spending by Category</h3>
        
        <div className={styles.categoryList}>
          {Object.entries(categoryTotals).map(([cat, amount]) => {
            const catPercent = totalAct > 0 ? (amount / totalAct) * 100 : 0;
            const color = CATEGORY_COLORS[cat] || '#64748b';

            return (
              <div key={cat} className={styles.categoryItem}>
                <div className={styles.itemLabelRow}>
                  <div className={styles.catIconName}>
                    <span className={styles.colorDot} style={{ backgroundColor: color }} />
                    <span>{t(`budget.categories.${cat}`)}</span>
                  </div>
                  <span className={styles.itemAmount}>
                    {amount.toLocaleString()} THB ({Math.round(catPercent)}%)
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
      </div>
    </div>
  );
};

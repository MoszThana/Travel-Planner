'use client';

import React, { useState } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/utils/api';
import styles from './Dashboard.module.css';
import { Icon } from './Icon';

interface DashboardProps {
  trips: any[];
  onTripSelect: (tripId: string) => void;
  onRefresh: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ trips, onTripSelect, onRefresh }) => {
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !destination || !startDate || !endDate || !user) return;

    setLoading(true);
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();

    if (endMs < startMs) {
      alert(t('common.error') + ': End date cannot be before start date.');
      setLoading(false);
      return;
    }

    try {
      // 1. Try backend
      await apiRequest('/trips', {
        method: 'POST',
        body: JSON.stringify({
          name,
          destination,
          startDate: startMs,
          endDate: endMs,
          ownerId: user.id
        })
      });
    } catch (err) {
      console.warn('Backend save failed, saving to LocalStorage fallback.');
      
      // 2. LocalStorage fallback
      const offlineTrips = JSON.parse(localStorage.getItem('offline_trips') || '[]');
      const tripId = `trip-${Date.now()}`;
      
      // Calculate days
      const days: any[] = [];
      const diffTime = Math.abs(endMs - startMs);
      const diffDays = Math.ceil(diffTime / (86400000)) + 1;
      for (let i = 1; i <= diffDays; i++) {
        const d = new Date(startMs);
        d.setDate(d.getDate() + (i - 1));
        days.push({
          id: `day-${tripId}-${i}`,
          tripId,
          dayNumber: i,
          date: d.getTime()
        });
      }

      const newTrip = {
        id: tripId,
        name,
        destination,
        startDate: startMs,
        endDate: endMs,
        ownerId: user.id,
        createdAt: Date.now(),
        days,
        activities: [],
        members: [
          { ...user, role: 'owner' },
          { id: 'user-somchai', name: 'Somchai', email: 'somchai@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Somchai', role: 'editor' },
          { id: 'user-jane', name: 'Jane', email: 'jane@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Jane', role: 'editor' },
          { id: 'user-david', name: 'David', email: 'david@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=David', role: 'viewer' }
        ],
        expenses: [],
        splits: [],
        emergency: [],
        votes: []
      };

      offlineTrips.push(newTrip);
      localStorage.setItem('offline_trips', JSON.stringify(offlineTrips));
    }

    setName('');
    setDestination('');
    setStartDate('');
    setEndDate('');
    setShowForm(false);
    setLoading(false);
    onRefresh();
  };

  const formatDate = (ms: number, withYear = false) => {
    return new Date(ms).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {})
    });
  };

  const DAY_MS = 86400000;
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const getStatus = (trip: any): { label: string; tone: string } => {
    const today = startOfDay(Date.now());
    const start = startOfDay(trip.startDate);
    const end = startOfDay(trip.endDate);
    if (today < start) {
      const count = Math.round((start - today) / DAY_MS);
      return {
        label: count === 1 ? t('dashboard.status_tomorrow') : t('dashboard.status_upcoming', { count }),
        tone: 'status-accent'
      };
    }
    if (today <= end) return { label: t('dashboard.status_ongoing'), tone: 'status-success' };
    return { label: t('dashboard.status_past'), tone: '' };
  };

  // Hero statistics
  const today = startOfDay(Date.now());
  const upcomingTrips = trips
    .filter((tr) => startOfDay(tr.startDate) >= today)
    .sort((a, b) => a.startDate - b.startDate);
  const totalDays = trips.reduce(
    (sum, tr) => sum + Math.max(1, Math.round((startOfDay(tr.endDate) - startOfDay(tr.startDate)) / DAY_MS) + 1),
    0
  );
  const nextTrip = upcomingTrips[0];
  const daysToNext = nextTrip ? Math.round((startOfDay(nextTrip.startDate) - today) / DAY_MS) : null;

  return (
    <div className="page">
      {/* Hero banner */}
      <section className="hero">
        <div>
          {user && <span className="hero-stat-label">{t('dashboard.greeting', { name: user.name })}</span>}
          <h1 className="hero-title" style={{ marginTop: 8 }}>
            {t('dashboard.hero_before')} <span className="hero-highlight">{t('dashboard.hero_highlight')}</span>
          </h1>
          <p className="hero-text">{t('dashboard.hero_text')}</p>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-label">{t('dashboard.stat_total')}</span>
            <span className="hero-stat-value">{trips.length}</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">{t('dashboard.stat_upcoming')}</span>
            <span className="hero-stat-value highlight">{upcomingTrips.length}</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">{t('dashboard.stat_days')}</span>
            <span className="hero-stat-value">{totalDays}</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">{t('dashboard.stat_next')}</span>
            <span className="hero-stat-value">
              {daysToNext === null ? '—' : daysToNext === 0 ? t('dashboard.status_today') : daysToNext === 1 ? t('dashboard.status_tomorrow') : t('dashboard.status_upcoming', { count: daysToNext })}
            </span>
            {nextTrip && <span className="hero-stat-sub">{nextTrip.name}</span>}
          </div>
        </div>
      </section>

      <div className="page-header">
        <h2 className="section-title">{t('dashboard.my_trips')}</h2>
        {!showForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={16} />
            {t('dashboard.new_trip')}
          </button>
        )}
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className={`card form ${styles.formCard}`}>
          <h2 className="sheet-title">{t('trip_form.title')}</h2>

          <div className="field">
            <label className="label">{t('trip_form.trip_name')}</label>
            <input
              type="text"
              required
              className="input"
              placeholder={t('trip_form.trip_name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="label">{t('trip_form.destination')}</label>
            <input
              type="text"
              required
              className="input"
              placeholder={t('trip_form.destination_placeholder')}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">{t('trip_form.start_date')}</label>
              <input
                type="date"
                required
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">{t('trip_form.end_date')}</label>
              <input
                type="date"
                required
                className="input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? t('common.loading') : t('trip_form.submit')}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.tripList}>
          {trips.length === 0 ? (
            <div className="empty">
              <Icon name="map" size={28} />
              {t('dashboard.no_trips')}
            </div>
          ) : (
            trips.map((trip) => {
              const daysCount = Math.max(1, Math.round((startOfDay(trip.endDate) - startOfDay(trip.startDate)) / DAY_MS) + 1);
              const status = getStatus(trip);
              const start = new Date(trip.startDate);
              return (
                <button key={trip.id} className={styles.tripCard} onClick={() => onTripSelect(trip.id)}>
                  <div className={styles.cardTop}>
                    <div className={styles.dateTile}>
                      <span className={styles.dateMonth}>
                        {start.toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { month: 'short' })}
                      </span>
                      <span className={styles.dateDay}>{start.getDate()}</span>
                    </div>
                    <span className={`status ${status.tone}`}>{status.label}</span>
                  </div>

                  <div className={styles.tripBody}>
                    <span className={styles.tripName}>{trip.name}</span>
                    <span className={styles.tripDest}>
                      <Icon name="pin" size={14} />
                      {trip.destination}
                    </span>
                  </div>

                  <div className={styles.tripMeta}>
                    <span>{formatDate(trip.startDate)} – {formatDate(trip.endDate, true)}</span>
                    <span className={styles.tripDays}>
                      {t('dashboard.days_count', { count: daysCount })}
                      <Icon name="arrowRight" size={16} className={styles.chevron} />
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

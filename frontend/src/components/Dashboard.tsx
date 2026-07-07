'use client';

import React, { useState } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/utils/api';
import styles from './Dashboard.module.css';

interface DashboardProps {
  trips: any[];
  onTripSelect: (tripId: string) => void;
  onRefresh: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ trips, onTripSelect, onRefresh }) => {
  const { t } = useTranslation();
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

  const formatDate = (ms: number) => {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.titleSection}>
        <h2 className={styles.title}>{t('dashboard.my_trips')}</h2>
        {!showForm && (
          <button className={styles.createBtn} onClick={() => setShowForm(true)}>
            + {t('dashboard.create_new_trip')}
          </button>
        )}
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className={styles.formCard}>
          <h3 className={styles.formTitle}>{t('trip_form.title')}</h3>
          
          <div className={styles.formGroup}>
            <label className={styles.label}>{t('trip_form.trip_name')}</label>
            <input
              type="text"
              required
              className={styles.input}
              placeholder={t('trip_form.trip_name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>{t('trip_form.destination')}</label>
            <input
              type="text"
              required
              className={styles.input}
              placeholder={t('trip_form.destination_placeholder')}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t('trip_form.start_date')}</label>
              <input
                type="date"
                required
                className={styles.input}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>{t('trip_form.end_date')}</label>
              <input
                type="date"
                required
                className={styles.input}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.buttonGroup}>
            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? t('common.loading') : t('trip_form.submit')}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.tripList}>
          {trips.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '32px 0' }}>{t('dashboard.no_trips')}</p>
          ) : (
            trips.map((trip) => {
              const daysCount = trip.days ? trip.days.length : 0;
              return (
                <div key={trip.id} className={styles.tripCard} onClick={() => onTripSelect(trip.id)}>
                  <div className={styles.tripHeader}>
                    <div>
                      <h4 className={styles.tripName}>{trip.name}</h4>
                      <span className={styles.tripDest}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                          <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        {trip.destination}
                      </span>
                    </div>
                    <span className={styles.dayBadge}>
                      {t('dashboard.days_count', { count: daysCount })}
                    </span>
                  </div>
                  <div className={styles.tripDetails}>
                    <span className={styles.dateRange}>
                      {t('dashboard.starts_on', { date: formatDate(trip.startDate) })}
                    </span>
                    <span className={styles.arrowIcon}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                      </svg>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

'use client';

import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/utils/api';
import styles from './Itinerary.module.css';

interface ItineraryProps {
  trip: any;
  onBack: () => void;
  onRefresh: () => void;
}

export const Itinerary: React.FC<ItineraryProps> = ({ trip, onBack, onRefresh }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [time, setTime] = useState('12:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [transportType, setTransportType] = useState('walk');
  const [estCost, setEstCost] = useState('0');
  const [costCategory, setCostCategory] = useState('other');
  const [saving, setSaving] = useState(false);

  // AI Alerts & Predictions State
  const [gapAlerts, setGapAlerts] = useState<any[]>([]);
  const [costPredictions, setCostPredictions] = useState<Record<string, any>>({});
  const [recList, setRecList] = useState<Record<string, any[]>>({});
  const [loadingAI, setLoadingAI] = useState<Record<string, boolean>>({});

  // Ensure mounting check to prevent Hydration failures in Next.js
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Run AI Gap Checker on active day activities
  const activeDay = trip.days && trip.days[activeDayIdx];
  const activeDayActivities = trip.activities 
    ? trip.activities.filter((a: any) => a.dayId === activeDay?.id)
    : [];

  useEffect(() => {
    if (activeDayActivities.length > 0) {
      const runGapCheck = async () => {
        try {
          const res = await apiRequest('/ai/gap-check', {
            method: 'POST',
            body: JSON.stringify({ activities: activeDayActivities })
          });
          setGapAlerts(res);
        } catch {
          setGapAlerts([]);
        }
      };
      runGapCheck();
    } else {
      setGapAlerts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDayIdx, trip.activities]);

  if (!isMounted) return <div style={{ padding: 24, textAlign: 'center' }}>{t('common.loading')}</div>;

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || !trip.activities) return;

    const sourceIdx = result.source.index;
    const destIdx = result.destination.index;

    // Filter active day items and copy
    const activeActivities = [...activeDayActivities];
    const [removed] = activeActivities.splice(sourceIdx, 1);
    activeActivities.splice(destIdx, 0, removed);

    // Map updated order index
    const updatedItems = activeActivities.map((item, index) => ({
      id: item.id,
      dayId: activeDay.id,
      order: index + 1
    }));

    // Update local state directly for responsive UI feeling
    const restActivities = trip.activities.filter((a: any) => a.dayId !== activeDay.id);
    const mergedActivities = [...restActivities];
    activeActivities.forEach((item, index) => {
      mergedActivities.push({
        ...item,
        order: index + 1
      });
    });
    trip.activities = mergedActivities;

    try {
      // Send reorder to backend
      await apiRequest('/activities/reorder', {
        method: 'PUT',
        body: JSON.stringify({ items: updatedItems })
      });
    } catch {
      // Offline fallback
      const offlineTrips = JSON.parse(localStorage.getItem('offline_trips') || '[]');
      const offlineTrip = offlineTrips.find((t: any) => t.id === trip.id);
      if (offlineTrip) {
        offlineTrip.activities = mergedActivities;
        localStorage.setItem('offline_trips', JSON.stringify(offlineTrips));
      }
    }
    onRefresh();
  };

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !activeDay) return;

    setSaving(true);
    const newOrder = activeDayActivities.length + 1;
    const payload = {
      dayId: activeDay.id,
      name,
      time,
      notes,
      location,
      transportType,
      estCost: parseFloat(estCost) || 0,
      costCategory,
      order: newOrder
    };

    try {
      await apiRequest('/activities', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('Saving activity offline...');
      const offlineTrips = JSON.parse(localStorage.getItem('offline_trips') || '[]');
      const offlineTrip = offlineTrips.find((t: any) => t.id === trip.id);
      if (offlineTrip) {
        offlineTrip.activities = offlineTrip.activities || [];
        offlineTrip.activities.push({
          id: `act-${Date.now()}`,
          ...payload,
          actCost: 0,
          visited: 0
        });
        localStorage.setItem('offline_trips', JSON.stringify(offlineTrips));
      }
    }

    setName('');
    setTime('12:00');
    setLocation('');
    setNotes('');
    setEstCost('0');
    setCostCategory('other');
    setTransportType('walk');
    setShowAddForm(false);
    setSaving(false);
    onRefresh();
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!window.confirm(t('common.confirm') + ' ' + t('common.delete') + '?')) return;

    try {
      await apiRequest(`/activities/${activityId}`, { method: 'DELETE' });
    } catch {
      const offlineTrips = JSON.parse(localStorage.getItem('offline_trips') || '[]');
      const offlineTrip = offlineTrips.find((t: any) => t.id === trip.id);
      if (offlineTrip) {
        offlineTrip.activities = offlineTrip.activities.filter((a: any) => a.id !== activityId);
        localStorage.setItem('offline_trips', JSON.stringify(offlineTrips));
      }
    }
    onRefresh();
  };

  const handleAddDay = async () => {
    try {
      await apiRequest(`/trips/${trip.id}/days`, { method: 'POST' });
    } catch {
      const offlineTrips = JSON.parse(localStorage.getItem('offline_trips') || '[]');
      const offlineTrip = offlineTrips.find((t: any) => t.id === trip.id);
      if (offlineTrip) {
        offlineTrip.days = offlineTrip.days || [];
        const nextDayNum = offlineTrip.days.length + 1;
        const lastDate = offlineTrip.days.length > 0 ? offlineTrip.days[offlineTrip.days.length - 1].date : Date.now();
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + 1);

        offlineTrip.days.push({
          id: `day-${trip.id}-${nextDayNum}`,
          tripId: trip.id,
          dayNumber: nextDayNum,
          date: nextDate.getTime()
        });
        offlineTrip.endDate = nextDate.getTime();
        localStorage.setItem('offline_trips', JSON.stringify(offlineTrips));
      }
    }
    onRefresh();
  };

  // Visited / Check-in toggle with mobile-optimized modal details entry
  const handleCheckinToggle = async (act: any) => {
    const isVisited = act.visited === 1;
    let updates: any = { visited: isVisited ? 0 : 1 };

    if (!isVisited) {
      const actTime = window.prompt('Check-in: Actual arrival time (HH:MM)?', act.time || '');
      const actCostVal = window.prompt('Check-in: Actual spending amount?', act.estCost ? String(act.estCost) : '0');
      const actNote = window.prompt('Check-in: Add any actual arrival notes?', act.notes || '');

      if (actTime !== null) updates.time = actTime;
      if (actCostVal !== null) updates.actCost = parseFloat(actCostVal) || 0;
      if (actNote !== null) updates.notes = actNote;
    }

    try {
      await apiRequest(`/activities/${act.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
    } catch {
      const offlineTrips = JSON.parse(localStorage.getItem('offline_trips') || '[]');
      const offlineTrip = offlineTrips.find((t: any) => t.id === trip.id);
      if (offlineTrip) {
        offlineTrip.activities = offlineTrip.activities.map((a: any) => 
          a.id === act.id ? { ...a, ...updates } : a
        );
        localStorage.setItem('offline_trips', JSON.stringify(offlineTrips));
      }
    }
    onRefresh();
  };

  // AI Cost Predictor Trigger
  const triggerCostPredictor = async (act: any) => {
    setLoadingAI(prev => ({ ...prev, [`cost-${act.id}`]: true }));
    try {
      const res = await apiRequest('/ai/predict-cost', {
        method: 'POST',
        body: JSON.stringify({
          activityName: act.name,
          category: act.costCategory,
          destination: trip.destination
        })
      });
      setCostPredictions(prev => ({ ...prev, [act.id]: res }));
    } catch {
      setCostPredictions(prev => ({
        ...prev,
        [act.id]: { currency: 'THB', minPrice: act.estCost || 100, maxPrice: (act.estCost || 100) * 1.5, explanation: 'Simulation: typical cost for this activity.' }
      }));
    }
    setLoadingAI(prev => ({ ...prev, [`cost-${act.id}`]: false }));
  };

  // AI Nearby Places Trigger
  const triggerAIPoints = async (act: any) => {
    setLoadingAI(prev => ({ ...prev, [`rec-${act.id}`]: true }));
    try {
      const res = await apiRequest('/ai/recommend', {
        method: 'POST',
        body: JSON.stringify({
          destination: trip.destination,
          activityName: act.name,
          weather: 'Clear'
        })
      });
      setRecList(prev => ({ ...prev, [act.id]: res }));
    } catch {
      setRecList(prev => ({
        ...prev,
        [act.id]: [
          { name: 'Local Coffee Spot', category: 'cafe', reason: 'Cozy retreat nearby' },
          { name: 'Local Restaurant', category: 'food', reason: 'Try local specialties' }
        ]
      }));
    }
    setLoadingAI(prev => ({ ...prev, [`rec-${act.id}`]: false }));
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <button className={styles.backBtn} onClick={onBack}>
          ← {t('common.back')}
        </button>
        <span className={styles.tripTitle}>{trip.name}</span>
      </div>

      {/* Day Navigation Tabs */}
      <div className={styles.dayTabs}>
        {trip.days?.map((d: any, idx: number) => (
          <button
            key={d.id}
            className={`${styles.dayTab} ${activeDayIdx === idx ? styles.dayTabActive : ''}`}
            onClick={() => setActiveDayIdx(idx)}
          >
            {t('itinerary.day', { number: d.dayNumber })}
          </button>
        ))}
        <button className={styles.addDayBtn} onClick={handleAddDay}>
          + Day
        </button>
      </div>

      {/* AI Schedule Checker Banner */}
      {gapAlerts.length > 0 && (
        <div className={styles.gapBanner}>
          <div className={styles.gapTitle}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            {t('ai.smart_gap')}
          </div>
          <div className={styles.gapList}>
            {gapAlerts.map((a: any, i: number) => (
              <span key={i} className={styles.gapItem}>⚠️ {a.message}</span>
            ))}
          </div>
        </div>
      )}

      {/* Timeline with Drag and Drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="activities-list">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className={styles.timeline}
            >
              {activeDayActivities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                  {t('itinerary.no_activities')}
                </div>
              ) : (
                activeDayActivities.map((act: any, index: number) => {
                  const isVisited = act.visited === 1;
                  const hasPrediction = !!costPredictions[act.id];
                  const hasRecs = !!recList[act.id];

                  return (
                    <Draggable key={act.id} draggableId={act.id} index={index}>
                      {(dragProvided) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className={styles.activityWrapper}
                        >
                          <div className={`${styles.timelineDot} ${isVisited ? styles.timelineDotVisited : ''}`} />
                          
                          <div className={styles.activityCard}>
                            <div className={styles.cardHeader}>
                              <div>
                                <span className={styles.timeBadge}>{act.time}</span>
                                <h4 className={`${styles.cardTitle} ${isVisited ? styles.cardTitleVisited : ''}`}>
                                  {act.name}
                                </h4>
                              </div>
                              <button className={styles.deleteBtn} onClick={() => handleDeleteActivity(act.id)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  <line x1="10" y1="11" x2="10" y2="17"></line>
                                  <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                              </button>
                            </div>

                            {act.location && (
                              <div className={styles.locationRow}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                  <circle cx="12" cy="10" r="3"></circle>
                                </svg>
                                {act.location}
                              </div>
                            )}

                            {act.notes && (
                              <p className={styles.notes}>{act.notes}</p>
                            )}

                            {/* Card controls & spending details */}
                            <div className={styles.cardFooter}>
                              <div className={styles.leftControls}>
                                <label className={`${styles.checkinLabel} ${isVisited ? styles.checkinLabelVisited : ''}`}>
                                  <input
                                    type="checkbox"
                                    className={styles.checkbox}
                                    checked={isVisited}
                                    onChange={() => handleCheckinToggle(act)}
                                  />
                                  {isVisited ? t('itinerary.visited') : t('itinerary.mark_visited')}
                                </label>
                              </div>

                              <div className={styles.costGroup}>
                                <span className={`${styles.costBadge} ${styles.estCost}`}>
                                  Est: {act.estCost}
                                </span>
                                {act.actCost > 0 && (
                                  <span className={`${styles.costBadge} ${styles.actCost}`}>
                                    Act: {act.actCost}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* AI Action Hooks */}
                            <div className={styles.aiActions}>
                              <button className={styles.aiCardBtn} onClick={() => triggerCostPredictor(act)}>
                                {loadingAI[`cost-${act.id}`] ? '...' : '✨ ' + t('ai.cost_predictor')}
                              </button>
                              <button className={styles.aiCardBtn} onClick={() => triggerAIPoints(act)}>
                                {loadingAI[`rec-${act.id}`] ? '...' : '✨ ' + t('ai.recommendations')}
                              </button>
                            </div>

                            {/* AI Prediction Outputs */}
                            {hasPrediction && (
                              <div className={styles.aiPredictBox}>
                                <div className={styles.aiPredictTitle}>🤖 Gemini Predictor</div>
                                <div>Est. Cost Range: {costPredictions[act.id].minPrice} - {costPredictions[act.id].maxPrice} {costPredictions[act.id].currency}</div>
                                <div style={{ fontSize: '10px', marginTop: '2px' }}>{costPredictions[act.id].explanation}</div>
                              </div>
                            )}

                            {/* AI Recommendations Outputs */}
                            {hasRecs && (
                              <div className={styles.aiPredictBox}>
                                <div className={styles.aiPredictTitle} style={{ color: 'var(--primary)' }}>🤖 Nearby Highlights</div>
                                <ul style={{ listStyleType: 'none', paddingLeft: 0, marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {recList[act.id].map((rec, i) => (
                                    <li key={i}>
                                      <strong>📍 {rec.name}</strong> ({rec.category}) - <span style={{ fontSize: '10px' }}>{rec.reason}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  );
                })
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <button className={styles.addDayBtn} style={{ marginTop: 12, borderStyle: 'solid', background: 'var(--surface)' }} onClick={() => setShowAddForm(true)}>
        + {t('itinerary.add_activity')}
      </button>

      {/* Add Activity Modal Sheet */}
      {showAddForm && (
        <div className={styles.modalOverlay} onClick={() => setShowAddForm(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.tripTitle}>{t('itinerary.add_activity')}</h3>
            <form onSubmit={handleAddActivity} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className={styles.formGroup}>
                <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                  {t('itinerary.activity_name')}
                </label>
                <input
                  type="text"
                  required
                  className={styles.textarea}
                  style={{ minHeight: 'unset' }}
                  placeholder="e.g., Tokyo Tower Visit"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                    {t('itinerary.time')}
                  </label>
                  <input
                    type="time"
                    className={styles.textarea}
                    style={{ minHeight: 'unset' }}
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                    {t('itinerary.transport')}
                  </label>
                  <select
                    className={styles.select}
                    value={transportType}
                    onChange={(e) => setTransportType(e.target.value)}
                  >
                    <option value="walk">{t('itinerary.transport_walk')}</option>
                    <option value="car">{t('itinerary.transport_car')}</option>
                    <option value="train">{t('itinerary.transport_train')}</option>
                    <option value="flight">{t('itinerary.transport_flight')}</option>
                    <option value="bus">{t('itinerary.transport_bus')}</option>
                    <option value="other">{t('itinerary.transport_other')}</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                    {t('itinerary.est_cost')}
                  </label>
                  <input
                    type="number"
                    className={styles.textarea}
                    style={{ minHeight: 'unset' }}
                    value={estCost}
                    onChange={(e) => setEstCost(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                    Cost Category
                  </label>
                  <select
                    className={styles.select}
                    value={costCategory}
                    onChange={(e) => setCostCategory(e.target.value)}
                  >
                    <option value="food">Food</option>
                    <option value="transport">Transport</option>
                    <option value="hotel">Accommodation</option>
                    <option value="activity">Tickets</option>
                    <option value="shopping">Shopping</option>
                    <option value="emergency">Emergency</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                  Location Name
                </label>
                <input
                  type="text"
                  className={styles.textarea}
                  style={{ minHeight: 'unset' }}
                  placeholder="Address or Google Places Name"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                  {t('itinerary.notes')}
                </label>
                <textarea
                  className={styles.textarea}
                  placeholder="Important notes, codes, phone numbers"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="submit" disabled={saving} className={styles.addDayBtn} style={{ flex: 2, background: 'var(--primary)', color: 'white', border: 'none' }}>
                  {saving ? t('common.loading') : t('common.save')}
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

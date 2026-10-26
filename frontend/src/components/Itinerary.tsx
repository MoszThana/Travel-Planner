'use client';

import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, showError, showSuccess } from '@/utils/api';
import { formatMoney } from '@/utils/money';
import { useAiEnabled } from '@/utils/useAiEnabled';
import styles from './Itinerary.module.css';
import { AttachmentsModal } from './AttachmentsModal';
import { MembersModal } from './MembersModal';
import { Icon, TRANSPORT_ICONS } from './Icon';
import { confirmDialog } from './Feedback';
import { CheckInSheet } from './CheckInSheet';
import { ActivityForm } from './ActivityForm';
import { timeAgo } from '@/utils/time';
import { GoogleMapEmbed } from './GoogleMapEmbed';
import { hasPoint, googleDirectionsUrl } from '@/utils/maps';

interface ItineraryProps {
  trip: any;
  onBack: () => void;
  onRefresh: () => void;
  userRole?: string;
}

export const Itinerary: React.FC<ItineraryProps> = ({ trip, onBack, onRefresh, userRole = 'editor' }) => {
  const { t, locale } = useTranslation();
  const aiEnabled = useAiEnabled();
  const currency = trip.currency || 'THB';
  const money = (value: number) => formatMoney(value, currency, locale);
  const { user } = useAuth();
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any | null>(null);
  const [openMaps, setOpenMaps] = useState<Record<string, boolean>>({});
  const [checkinActivity, setCheckinActivity] = useState<any | null>(null);

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

  const handleEditClick = (act: any) => {
    setEditingActivity(act);
    setShowAddForm(true);
  };

  const handleCloseForm = () => {
    setEditingActivity(null);
    setShowAddForm(false);
  };

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
      await apiRequest('/activities/reorder', {
        method: 'PUT',
        body: JSON.stringify({ items: updatedItems })
      });
    } catch (err) {
      showError(err, t('itinerary.reorder_failed'));
    }
    // Reload either way so the list shows what is really saved
    onRefresh();
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!(await confirmDialog({ message: t('itinerary.delete_confirm'), confirmLabel: t('common.delete'), cancelLabel: t('common.cancel'), danger: true }))) return;

    try {
      await apiRequest(`/activities/${activityId}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) {
      showError(err, t('itinerary.delete_failed'));
    }
  };

  const handleAddDay = async () => {
    try {
      await apiRequest(`/trips/${trip.id}/days`, { method: 'POST' });
      onRefresh();
    } catch (err) {
      showError(err, t('itinerary.add_day_failed'));
    }
  };

  // Check-in opens a small form; un-checking is one tap
  const handleCheckinToggle = async (act: any) => {
    if (act.visited !== 1) {
      setCheckinActivity(act);
      return;
    }
    try {
      await apiRequest(`/activities/${act.id}`, {
        method: 'PUT',
        body: JSON.stringify({ visited: 0 })
      });
      onRefresh();
    } catch (err) {
      showError(err, t('checkin.error'));
    }
  };

  // AI Cost Predictor Trigger (only shown when AI is set up)
  const triggerCostPredictor = async (act: any) => {
    setLoadingAI(prev => ({ ...prev, [`cost-${act.id}`]: true }));
    try {
      const res = await apiRequest('/ai/predict-cost', {
        method: 'POST',
        body: JSON.stringify({
          activityName: act.name,
          category: act.costCategory,
          destination: trip.destination,
          currency
        })
      });
      setCostPredictions(prev => ({ ...prev, [act.id]: res }));
    } catch (err) {
      showError(err, t('itinerary.ai_failed'));
    }
    setLoadingAI(prev => ({ ...prev, [`cost-${act.id}`]: false }));
  };

  // AI Nearby Places Trigger (only shown when AI is set up)
  const triggerAIPoints = async (act: any) => {
    setLoadingAI(prev => ({ ...prev, [`rec-${act.id}`]: true }));
    try {
      const res = await apiRequest('/ai/recommend', {
        method: 'POST',
        body: JSON.stringify({
          destination: trip.destination,
          activityName: act.name
        })
      });
      setRecList(prev => ({ ...prev, [act.id]: res }));
    } catch (err) {
      showError(err, t('itinerary.ai_failed'));
    }
    setLoadingAI(prev => ({ ...prev, [`rec-${act.id}`]: false }));
  };

  return (
    <div className={`page ${styles.page}`}>
      {/* Trip header */}
      <div className={styles.topBar}>
        <button className="btn-icon" onClick={onBack} aria-label={t('common.back')}>
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className={styles.topActions}>
          <button className="btn btn-sm" onClick={() => setShowMembersModal(true)}>
            <Icon name="users" size={15} />
            {t('itinerary.members')}
          </button>
          <button className="btn btn-sm" onClick={() => setShowAttachmentsModal(true)}>
            <Icon name="paperclip" size={15} />
            {t('itinerary.files')}
          </button>
        </div>
      </div>

      <div className={styles.titleBlock}>
        <span className="eyebrow">{trip.destination}</span>
        <h1 className="page-title">{trip.name}</h1>
      </div>

      {/* Day Navigation Tabs */}
      <div className="pill-tabs">
        {trip.days?.map((d: any, idx: number) => (
          <button
            key={d.id}
            className={`pill-tab ${activeDayIdx === idx ? 'active' : ''}`}
            onClick={() => setActiveDayIdx(idx)}
          >
            {t('itinerary.day', { number: d.dayNumber })}
            <span className={styles.dayDate}>
              {new Date(d.date).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' })}
            </span>
          </button>
        ))}
        {userRole !== 'viewer' && (
          <button className="pill-tab dashed" onClick={handleAddDay} aria-label={t('itinerary.add_day')}>
            <Icon name="plus" size={14} />
          </button>
        )}
      </div>

      {/* AI Schedule Checker Banner */}
      {gapAlerts.length > 0 && (
        <div className={styles.gapBanner}>
          <div className={styles.gapTitle}>
            <Icon name="alert" size={16} />
            {t('ai.smart_gap')}
          </div>
          <ul className={styles.gapList}>
            {gapAlerts.map((a: any, i: number) => (
              <li key={i} className={styles.gapItem}>{a.message}</li>
            ))}
          </ul>
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
                <div className="empty">
                  <Icon name="calendar" size={28} />
                  {t('itinerary.no_activities')}
                </div>
              ) : (
                activeDayActivities.map((act: any, index: number) => {
                  const isVisited = act.visited === 1;
                  const hasPrediction = !!costPredictions[act.id];
                  const hasRecs = !!recList[act.id];
                  const prev = index > 0 ? activeDayActivities[index - 1] : null;
                  const transport = act.transportType || 'other';

                  return (
                    <Draggable key={act.id} draggableId={act.id} index={index} isDragDisabled={userRole === 'viewer'}>
                      {(dragProvided) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className={styles.activityWrapper}
                        >
                          <div className={styles.rail}>
                            <span className={`${styles.timeLabel} tabular`}>{act.time}</span>
                            <span className={`${styles.timelineDot} ${isVisited ? styles.timelineDotVisited : ''}`}>
                              {isVisited && <Icon name="check" size={10} strokeWidth={3} />}
                            </span>
                          </div>

                          <div className={`${styles.activityCard} lift ${isVisited ? styles.activityCardVisited : ''}`}>
                            <div className={styles.cardHeader}>
                              <h3 className={`${styles.cardTitle} ${isVisited ? styles.cardTitleVisited : ''}`}>
                                {act.name}
                              </h3>
                              {userRole !== 'viewer' && (
                                <div className={styles.cardActions}>
                                  <button className="btn-icon" onClick={() => handleEditClick(act)} aria-label={t('common.edit')}>
                                    <Icon name="edit" size={16} />
                                  </button>
                                  <button className="btn-icon danger" onClick={() => handleDeleteActivity(act.id)} aria-label={t('common.delete')}>
                                    <Icon name="trash" size={16} />
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className={styles.metaRow}>
                              {act.location && (
                                <span className={styles.metaItem}>
                                  <Icon name="pin" size={13} />
                                  {act.location}
                                </span>
                              )}
                              <span className={styles.metaItem}>
                                <Icon name={TRANSPORT_ICONS[transport] || 'route'} size={13} />
                                {t(`itinerary.transport_${transport}`)}
                              </span>
                            </div>

                            {act.updatedBy && act.updatedAt && (
                              <span className={styles.updatedBy}>
                                {t('itinerary.updated_by', {
                                  name: act.updatedBy === user?.id
                                    ? t('whatsnew.you')
                                    : trip.members?.find((m: any) => m.id === act.updatedBy)?.name || t('whatsnew.someone'),
                                  time: timeAgo(act.updatedAt, locale),
                                })}
                              </span>
                            )}

                            {act.notes && (
                              <p className={styles.notes}>{act.notes}</p>
                            )}

                            {/* Google Maps: navigate in the app, or preview the place / route here */}
                            {hasPoint(act) && (
                              <div className={styles.mapActions}>
                                <a
                                  href={googleDirectionsUrl(act, { transportType: act.transportType })}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-sm btn-primary"
                                >
                                  <Icon name="route" size={15} />
                                  {t('itinerary.navigate')}
                                </a>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => setOpenMaps(prevOpen => ({ ...prevOpen, [act.id]: !prevOpen[act.id] }))}
                                  aria-expanded={!!openMaps[act.id]}
                                >
                                  <Icon name="map" size={15} />
                                  {openMaps[act.id] ? t('itinerary.hide_map') : t('itinerary.show_map')}
                                </button>
                              </div>
                            )}

                            {hasPoint(act) && openMaps[act.id] && (
                              <GoogleMapEmbed place={act} from={prev} transportType={act.transportType} />
                            )}

                            {/* Card controls & spending details */}
                            <div className={styles.cardFooter}>
                              <label className={`${styles.checkinLabel} ${isVisited ? styles.checkinLabelVisited : ''}`}>
                                <input
                                  type="checkbox"
                                  className="checkbox"
                                  checked={isVisited}
                                  disabled={userRole === 'viewer'}
                                  onChange={() => handleCheckinToggle(act)}
                                />
                                {isVisited ? t('itinerary.visited') : t('itinerary.mark_visited')}
                              </label>

                              <div className={styles.costGroup}>
                                {act.estCost > 0 && (
                                  <span className="chip tabular">{t('itinerary.est', { amount: money(act.estCost) })}</span>
                                )}
                                {act.actCost > 0 && (
                                  <span className="chip chip-accent tabular">{t('itinerary.spent', { amount: money(act.actCost) })}</span>
                                )}
                              </div>
                            </div>

                            {/* AI Action Hooks — only when Gemini is set up */}
                            {aiEnabled && (
                              <div className={styles.aiActions}>
                                <button className={styles.aiCardBtn} onClick={() => triggerCostPredictor(act)} disabled={loadingAI[`cost-${act.id}`]}>
                                  <Icon name="sparkles" size={13} />
                                  {loadingAI[`cost-${act.id}`] ? t('common.loading') : t('ai.cost_predictor')}
                                </button>
                                <button className={styles.aiCardBtn} onClick={() => triggerAIPoints(act)} disabled={loadingAI[`rec-${act.id}`]}>
                                  <Icon name="sparkles" size={13} />
                                  {loadingAI[`rec-${act.id}`] ? t('common.loading') : t('ai.recommendations')}
                                </button>
                              </div>
                            )}

                            {/* AI Prediction Outputs */}
                            {hasPrediction && (
                              <div className={styles.aiPredictBox}>
                                <span className={styles.aiPredictTitle}>{t('itinerary.ai_cost_title')}</span>
                                <span className={styles.aiPredictValue}>
                                  {formatMoney(costPredictions[act.id].minPrice, costPredictions[act.id].currency || currency, locale)} – {formatMoney(costPredictions[act.id].maxPrice, costPredictions[act.id].currency || currency, locale)}
                                </span>
                                <span>{costPredictions[act.id].explanation}</span>
                              </div>
                            )}

                            {/* AI Recommendations Outputs */}
                            {hasRecs && (
                              <div className={styles.aiPredictBox}>
                                <span className={styles.aiPredictTitle}>{t('itinerary.ai_recs_title')}</span>
                                <ul className={styles.recList}>
                                  {recList[act.id].map((rec, i) => (
                                    <li key={i}>
                                      <strong>{rec.name}</strong>
                                      <span className={styles.recCategory}>{rec.category}</span>
                                      <span className={styles.recReason}>{rec.reason}</span>
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

      {userRole !== 'viewer' && (
        <button className={styles.addActivityBtn} onClick={() => setShowAddForm(true)}>
          <Icon name="plus" size={16} />
          {t('itinerary.add_activity')}
        </button>
      )}

      {/* Add/Edit Activity */}
      {showAddForm && activeDay && (
        <ActivityForm
          trip={trip}
          day={activeDay}
          dayNumber={activeDayIdx + 1}
          dayActivities={activeDayActivities}
          activity={editingActivity}
          onClose={handleCloseForm}
          onSaved={onRefresh}
        />
      )}

      {checkinActivity && (
        <CheckInSheet
          activity={checkinActivity}
          currency={currency}
          onClose={() => setCheckinActivity(null)}
          onSaved={() => {
            setCheckinActivity(null);
            showSuccess(t('checkin.done', { name: checkinActivity.name }));
            onRefresh();
          }}
        />
      )}

      <AttachmentsModal
        tripId={trip.id}
        isOpen={showAttachmentsModal}
        onClose={() => setShowAttachmentsModal(false)}
      />

      <MembersModal
        tripId={trip.id}
        isOpen={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        members={trip.members || []}
        userRole={userRole}
        onRefresh={onRefresh}
      />
    </div>
  );
};

'use client';

import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/utils/api';
import styles from './Itinerary.module.css';
import { AttachmentsModal } from './AttachmentsModal';
import { MembersModal } from './MembersModal';
import { Icon, TRANSPORT_ICONS } from './Icon';
import { GoogleMapEmbed } from './GoogleMapEmbed';
import { hasPoint, googleDirectionsUrl, googlePlaceUrl } from '@/utils/maps';

interface ItineraryProps {
  trip: any;
  onBack: () => void;
  onRefresh: () => void;
  userRole?: string;
}

export const Itinerary: React.FC<ItineraryProps> = ({ trip, onBack, onRefresh, userRole = 'editor' }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any | null>(null);
  const [openMaps, setOpenMaps] = useState<Record<string, boolean>>({});

  // Form Fields
  const [name, setName] = useState('');
  const [time, setTime] = useState('12:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [transportType, setTransportType] = useState('walk');
  const [estCost, setEstCost] = useState('0');
  const [costCategory, setCostCategory] = useState('other');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Leaflet map select states and refs
  const [selectedLat, setSelectedLat] = useState<number | null>(null);
  const [selectedLng, setSelectedLng] = useState<number | null>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const mapRef = React.useRef<any>(null);
  const markerRef = React.useRef<any>(null);

  // Suggestions states and refs
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const skipSearchRef = React.useRef(false);

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

  // Load Leaflet CDN script & styles when form is shown
  useEffect(() => {
    if (!showAddForm) return;

    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      setLeafletLoaded(true);
    };
    document.head.appendChild(script);
  }, [showAddForm]);

  // Initialize and update selection Leaflet map
  useEffect(() => {
    if (!showAddForm || !leafletLoaded) return;
    const L = (window as any).L;
    if (!L) return;

    // Use existing coordinates, or fall back to Bangkok center
    const initialLat = selectedLat || 13.7563;
    const initialLng = selectedLng || 100.5018;

    const mapContainer = document.getElementById('select-map-container');
    if (!mapContainer) return;

    // Destroy old instance if exists
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
    }

    // Initialize Map
    const map = L.map('select-map-container').setView([initialLat, initialLng], 12);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Place initial marker if coordinates exist
    if (selectedLat && selectedLng) {
      markerRef.current = L.marker([selectedLat, selectedLng]).addTo(map);
    }

    // Handle map click
    map.on('click', async (e: any) => {
      const { lat, lng } = e.latlng;
      
      // Update coordinates state
      setSelectedLat(lat);
      setSelectedLng(lng);

      // Move/Add marker
      if (markerRef.current) {
        markerRef.current.setLatLng(e.latlng);
      } else {
        markerRef.current = L.marker(e.latlng).addTo(map);
      }

      // Reverse geocode to find location name using free Nominatim API
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
          headers: {
            'User-Agent': 'TravelPlannerAppPrototype/1.0'
          }
        });
        const data = (await res.json()) as any;
        if (data && data.display_name) {
          // Fill in Location Name input with fetched address details
          const namePart = data.name || data.address.road || data.address.suburb || data.address.city || "Selected Location";
          setLocation(namePart);
        }
      } catch (err) {
        console.warn("Reverse geocoding failed", err);
      }
    });

    // Clean up on unmount or form toggle
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddForm, leafletLoaded]);

  // Debounced search trigger for Nominatim suggestions
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    if (!location.trim() || location.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=5`, {
          headers: {
            'User-Agent': 'TravelPlannerAppPrototype/1.0'
          }
        });
        const data = (await res.json()) as any[];
        setSuggestions(data || []);
        setShowSuggestions(true);
      } catch (err) {
        console.warn("Geocoding suggestions failed", err);
      } finally {
        setSearching(false);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(timer);
  }, [location]);

  const handleSelectSuggestion = (item: any) => {
    skipSearchRef.current = true;
    const namePart = item.name || item.display_name.split(',')[0];
    setLocation(namePart);

    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    setSelectedLat(lat);
    setSelectedLng(lng);
    setShowSuggestions(false);

    // Pan map to selection and update marker
    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 14);
      const L = (window as any).L;
      if (L) {
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng]).addTo(mapRef.current);
        }
      }
    }
  };

  if (!isMounted) return <div style={{ padding: 24, textAlign: 'center' }}>{t('common.loading')}</div>;

  const handleEditClick = (act: any) => {
    setEditingActivity(act);
    setName(act.name);
    setTime(act.time || '12:00');
    setLocation(act.location || '');
    setNotes(act.notes || '');
    setTransportType(act.transportType || 'walk');
    setEstCost(String(act.estCost || 0));
    setCostCategory(act.costCategory || 'other');
    setSelectedLat(act.lat ? parseFloat(act.lat) : null);
    setSelectedLng(act.lng ? parseFloat(act.lng) : null);
    setShowAddForm(true);
  };

  const handleCloseForm = () => {
    setFormError('');
    setEditingActivity(null);
    setName('');
    setTime('12:00');
    setLocation('');
    setNotes('');
    setEstCost('0');
    setCostCategory('other');
    setTransportType('walk');
    setSelectedLat(null);
    setSelectedLng(null);
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
    setFormError('');
    if (!name) return;
    if (!activeDay) {
      setFormError('This trip has no days loaded yet. Go back and open the trip again, or add a day first.');
      return;
    }

    setSaving(true);
    const newOrder = activeDayActivities.length + 1;
    const payload = {
      dayId: activeDay.id,
      name,
      time,
      notes,
      location,
      lat: selectedLat,
      lng: selectedLng,
      transportType,
      estCost: parseFloat(estCost) || 0,
      costCategory,
      order: editingActivity ? editingActivity.order : newOrder
    };

    try {
      if (editingActivity) {
        await apiRequest(`/activities/${editingActivity.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await apiRequest('/activities', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
    } catch (err) {
      console.warn('Saving activity offline...');
      const offlineTrips = JSON.parse(localStorage.getItem('offline_trips') || '[]');
      const offlineTrip = offlineTrips.find((t: any) => t.id === trip.id);
      if (offlineTrip) {
        offlineTrip.activities = offlineTrip.activities || [];
        if (editingActivity) {
          offlineTrip.activities = offlineTrip.activities.map((a: any) =>
            a.id === editingActivity.id ? { ...a, ...payload } : a
          );
        } else {
          offlineTrip.activities.push({
            id: `act-${Date.now()}`,
            ...payload,
            actCost: 0,
            visited: 0
          });
        }
        localStorage.setItem('offline_trips', JSON.stringify(offlineTrips));
      } else {
        // Nowhere to keep it: leave the form open so nothing typed is lost
        setFormError(err instanceof Error ? `Couldn't save: ${err.message}` : "Couldn't save the activity. Please try again.");
        setSaving(false);
        return;
      }
    }

    setName('');
    setTime('12:00');
    setLocation('');
    setNotes('');
    setEstCost('0');
    setCostCategory('other');
    setTransportType('walk');
    setEditingActivity(null);
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
    <div className={`page ${styles.page}`}>
      {/* Trip header */}
      <div className={styles.topBar}>
        <button className="btn-icon" onClick={onBack} aria-label={t('common.back')}>
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className={styles.topActions}>
          <button className="btn btn-sm" onClick={() => setShowMembersModal(true)}>
            <Icon name="users" size={15} />
            Members
          </button>
          <button className="btn btn-sm" onClick={() => setShowAttachmentsModal(true)}>
            <Icon name="paperclip" size={15} />
            Files
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
              {new Date(d.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </span>
          </button>
        ))}
        {userRole !== 'viewer' && (
          <button className="pill-tab dashed" onClick={handleAddDay} aria-label="Add day">
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

                          <div className={`${styles.activityCard} ${isVisited ? styles.activityCardVisited : ''}`}>
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
                                  Navigate
                                </a>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => setOpenMaps(prevOpen => ({ ...prevOpen, [act.id]: !prevOpen[act.id] }))}
                                  aria-expanded={!!openMaps[act.id]}
                                >
                                  <Icon name="map" size={15} />
                                  {openMaps[act.id] ? 'Hide map' : 'Show map'}
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
                                <span className="chip tabular">Est. {Number(act.estCost || 0).toLocaleString()}</span>
                                {act.actCost > 0 && (
                                  <span className="chip chip-accent tabular">Spent {Number(act.actCost).toLocaleString()}</span>
                                )}
                              </div>
                            </div>

                            {/* AI Action Hooks */}
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

                            {/* AI Prediction Outputs */}
                            {hasPrediction && (
                              <div className={styles.aiPredictBox}>
                                <span className={styles.aiPredictTitle}>Estimated cost</span>
                                <span className={styles.aiPredictValue}>
                                  {costPredictions[act.id].minPrice} – {costPredictions[act.id].maxPrice} {costPredictions[act.id].currency}
                                </span>
                                <span>{costPredictions[act.id].explanation}</span>
                              </div>
                            )}

                            {/* AI Recommendations Outputs */}
                            {hasRecs && (
                              <div className={styles.aiPredictBox}>
                                <span className={styles.aiPredictTitle}>Nearby highlights</span>
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

      {/* Add/Edit Activity Modal Sheet */}
      {showAddForm && (
        <div className="sheet-overlay" onClick={handleCloseForm}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2 className="sheet-title">{editingActivity ? 'Edit activity' : t('itinerary.add_activity')}</h2>
              <button type="button" className="btn-icon" onClick={handleCloseForm} aria-label={t('common.cancel')}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <form onSubmit={handleAddActivity} className="form">
              <div className="field">
                <label className="label">{t('itinerary.activity_name')}</label>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="e.g., Tokyo Tower Visit"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="field-row">
                <div className="field">
                  <label className="label">{t('itinerary.time')}</label>
                  <input
                    type="time"
                    className="input"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="label">{t('itinerary.transport')}</label>
                  <select
                    className="input"
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

              <div className="field-row">
                <div className="field">
                  <label className="label">{t('itinerary.est_cost')}</label>
                  <input
                    type="number"
                    className="input"
                    value={estCost}
                    onChange={(e) => setEstCost(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="label">Category</label>
                  <select
                    className="input"
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

              <div className="field">
                <label className="label">
                  Location
                  {searching && <span className={styles.searchingHint}>Searching…</span>}
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Search an address or place"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onFocus={() => {
                    if (location.trim().length >= 3) {
                      setShowSuggestions(true);
                    }
                  }}
                />

                {/* Suggestions Overlay Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className={styles.suggestions}>
                    {suggestions.map((item, idx) => (
                      <button
                        type="button"
                        key={idx}
                        className={styles.suggestionItem}
                        onClick={() => handleSelectSuggestion(item)}
                      >
                        <Icon name="pin" size={14} className={styles.suggestionIcon} />
                        <span className={styles.suggestionText}>
                          <strong>{item.name || item.display_name.split(',')[0]}</strong>
                          <span>{item.display_name}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Pin on Map selection section */}
              <div className="field">
                <label className="label">
                  Pin on map
                  {selectedLat ? (
                    <span className="tabular">{selectedLat.toFixed(4)}, {selectedLng?.toFixed(4)}</span>
                  ) : (
                    <span>Tap the map to choose</span>
                  )}
                </label>
                <div id="select-map-container" className={styles.selectMap} />
                {(selectedLat || location.trim()) && (
                  <a
                    href={googlePlaceUrl({ location, lat: selectedLat, lng: selectedLng })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.checkLink}
                  >
                    Check on Google Maps
                    <Icon name="arrowUpRight" size={12} />
                  </a>
                )}
              </div>

              <div className="field">
                <label className="label">{t('itinerary.notes')}</label>
                <textarea
                  className="input"
                  placeholder="Booking codes, phone numbers, reminders"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {formError && <div className="form-error">{formError}</div>}

              <div className="btn-row">
                <button type="button" className="btn" onClick={handleCloseForm}>
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
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

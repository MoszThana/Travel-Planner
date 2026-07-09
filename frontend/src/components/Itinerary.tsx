'use client';

import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/utils/api';
import styles from './Itinerary.module.css';
import { AttachmentsModal } from './AttachmentsModal';
import { MembersModal } from './MembersModal';

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

  // Form Fields
  const [name, setName] = useState('');
  const [time, setTime] = useState('12:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [transportType, setTransportType] = useState('walk');
  const [estCost, setEstCost] = useState('0');
  const [costCategory, setCostCategory] = useState('other');
  const [saving, setSaving] = useState(false);

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
    if (!name || !activeDay) return;

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
    <div className={styles.container}>
      <div className={styles.headerRow} style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '8px' }}>
        <button className={styles.backBtn} onClick={onBack}>
          ← {t('common.back')}
        </button>
        <span className={styles.tripTitle} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trip.name}</span>
        <button className={styles.addDayBtn} onClick={() => setShowMembersModal(true)} style={{ margin: 0, padding: '6px 12px', fontSize: '13px', width: 'auto', background: 'var(--primary)', color: 'white', border: 'none' }}>
          👥 Members
        </button>
        <button className={styles.addDayBtn} onClick={() => setShowAttachmentsModal(true)} style={{ margin: 0, padding: '6px 12px', fontSize: '13px', width: 'auto' }}>
          📎 Files
        </button>
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
        {userRole !== 'viewer' && (
          <button className={styles.addDayBtn} onClick={handleAddDay}>
            + Day
          </button>
        )}
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
                    <Draggable key={act.id} draggableId={act.id} index={index} isDragDisabled={userRole === 'viewer'}>
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
                              {userRole !== 'viewer' && (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button className={styles.deleteBtn} style={{ color: 'var(--primary)' }} onClick={() => handleEditClick(act)}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                      <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
                                    </svg>
                                  </button>
                                  <button className={styles.deleteBtn} onClick={() => handleDeleteActivity(act.id)}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6"></polyline>
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                      <line x1="10" y1="11" x2="10" y2="17"></line>
                                      <line x1="14" y1="11" x2="14" y2="17"></line>
                                    </svg>
                                  </button>
                                </div>
                              )}
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

                            {/* Show transport mode and directions link if there is a previous activity to route from */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', background: 'var(--background)', padding: '6px 8px', borderRadius: '4px' }}>
                              <span>
                                {act.transportType === 'walk' ? '🚶 Walk' :
                                 act.transportType === 'train' ? '🚆 Train' :
                                 act.transportType === 'car' ? '🚗 Car' :
                                 act.transportType === 'flight' ? '✈️ Flight' :
                                 act.transportType === 'bus' ? '🚌 Bus' : '🚌 Transport'}
                              </span>
                              {index > 0 && activeDayActivities[index - 1].location && act.location && (
                                <a 
                                  href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(activeDayActivities[index - 1].location)}&destination=${encodeURIComponent(act.location)}&travelmode=${
                                    act.transportType === 'walk' ? 'walking' :
                                    act.transportType === 'car' ? 'driving' :
                                    act.transportType === 'train' || act.transportType === 'bus' ? 'transit' : 'driving'
                                  }`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: 'var(--secondary)', textDecoration: 'underline', fontWeight: '700' }}
                                >
                                  Map Directions →
                                </a>
                              )}
                            </div>

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
                                    disabled={userRole === 'viewer'}
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

      {userRole !== 'viewer' && (
        <button className={styles.addDayBtn} style={{ marginTop: 12, borderStyle: 'solid', background: 'var(--surface)' }} onClick={() => setShowAddForm(true)}>
          + {t('itinerary.add_activity')}
        </button>
      )}

      {/* Add/Edit Activity Modal Sheet */}
      {showAddForm && (
        <div className={styles.modalOverlay} onClick={handleCloseForm}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.tripTitle}>{editingActivity ? 'Edit Activity' : t('itinerary.add_activity')}</h3>
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

              <div className={styles.formGroup} style={{ position: 'relative' }}>
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
                  onFocus={() => {
                    if (location.trim().length >= 3) {
                      setShowSuggestions(true);
                    }
                  }}
                />

                {/* Search suggestion indicator */}
                {searching && (
                  <div style={{ position: 'absolute', right: '12px', top: '34px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Searching...
                  </div>
                )}

                {/* Suggestions Overlay Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                    zIndex: 2000,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    marginTop: '4px'
                  }}>
                    {suggestions.map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectSuggestion(item)}
                        style={{
                          padding: '10px 14px',
                          borderBottom: idx === suggestions.length - 1 ? 'none' : '1px solid var(--border)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: 'var(--text)',
                          transition: 'background 0.2s',
                          background: 'transparent'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <strong style={{ color: 'var(--primary)' }}>{item.name || item.display_name.split(',')[0]}</strong>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.display_name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pin on Map selection section */}
              <div className={styles.formGroup}>
                <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>📍 Pin on Map (Tap map to select location)</span>
                  {selectedLat && (
                    <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 'bold' }}>
                      ({selectedLat.toFixed(4)}, {selectedLng?.toFixed(4)})
                    </span>
                  )}
                </label>
                <div id="select-map-container" style={{ width: '100%', height: '180px', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', marginTop: '4px', zIndex: 1 }} />
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
                <button type="button" className={styles.addDayBtn} style={{ flex: 1 }} onClick={handleCloseForm}>
                  {t('common.cancel')}
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

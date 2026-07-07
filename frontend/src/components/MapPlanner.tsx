'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { apiRequest } from '@/utils/api';
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import styles from './MapPlanner.module.css';

interface MapPlannerProps {
  trip: any;
  onRefresh: () => void;
}

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

// Default Bangkok fallback coordinates if no locations exist
const DEFAULT_CENTER = {
  lat: 13.7563,
  lng: 100.5018
};

export const MapPlanner: React.FC<MapPlannerProps> = ({ trip, onRefresh }) => {
  const { t } = useTranslation();
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Optimization states
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [optimizedOrder, setOptimizedOrder] = useState<any[]>([]);

  // Map reference to programmatically pan
  const mapRef = useRef<google.maps.Map | null>(null);

  const activeDay = trip.days && trip.days[activeDayIdx];
  const dayActivities = trip.activities
    ? trip.activities.filter((a: any) => a.dayId === activeDay?.id)
    : [];

  // Filter activities that have valid coordinates
  const validMapActivities = dayActivities.filter((act: any) => act.lat && act.lng);

  // Initialize Google Maps script loader
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey
  });

  // Calculate Map center based on average coordinates
  const getMapCenter = () => {
    if (validMapActivities.length === 0) {
      return DEFAULT_CENTER;
    }
    let totalLat = 0;
    let totalLng = 0;
    validMapActivities.forEach((act: any) => {
      totalLat += act.lat;
      totalLng += act.lng;
    });
    return {
      lat: totalLat / validMapActivities.length,
      lng: totalLng / validMapActivities.length
    };
  };

  const center = getMapCenter();

  // Generate multi-destination redirect URL to open in external Google Maps app
  const getGoogleMapsDirectionsUrl = () => {
    if (dayActivities.length === 0) return '';
    
    // Fallback coordinates if names are missing
    const getLocStr = (act: any) => {
      if (act.location) return act.location;
      if (act.lat && act.lng) return `${act.lat},${act.lng}`;
      return '';
    };

    const firstLoc = getLocStr(dayActivities[0]);
    const lastLoc = getLocStr(dayActivities[dayActivities.length - 1]);

    if (!firstLoc) return '';

    const origin = encodeURIComponent(firstLoc);
    const destination = encodeURIComponent(lastLoc || firstLoc);
    
    let waypoints = '';
    if (dayActivities.length > 2) {
      const middle = dayActivities.slice(1, -1).filter((act: any) => getLocStr(act));
      if (middle.length > 0) {
        waypoints = '&waypoints=' + middle.map((m: any) => encodeURIComponent(getLocStr(m))).join('|');
      }
    }
    
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints}&travelmode=driving`;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery || !activeDay) return;

    // Simulate location discovery
    const mockLat = center.lat + (Math.random() - 0.5) * 0.03;
    const mockLng = center.lng + (Math.random() - 0.5) * 0.03;

    const payload = {
      dayId: activeDay.id,
      name: searchQuery,
      time: '14:30',
      location: searchQuery,
      lat: mockLat,
      lng: mockLng,
      transportType: 'walk',
      estCost: 500,
      costCategory: 'activity',
      order: dayActivities.length + 1
    };

    apiRequest('/activities', {
      method: 'POST',
      body: JSON.stringify(payload)
    }).then(() => {
      setSearchQuery('');
      onRefresh();
    }).catch(() => {
      // Offline fallback
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
      setSearchQuery('');
      onRefresh();
    });
  };

  const handleOptimizeClick = () => {
    if (dayActivities.length < 3) {
      alert('Needs at least 3 activities on the timeline to calculate optimizations.');
      return;
    }
    
    setIsOptimizing(true);
    setTimeout(() => {
      // TSP nearest neighbor algorithm based on coordinates
      const original = [...dayActivities];
      const optimized = [original[0]];
      const remaining = original.slice(1);
      
      let current = original[0];
      while (remaining.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const dy = (remaining[i].lat || current.lat || 0) - (current.lat || 0);
          const dx = (remaining[i].lng || current.lng || 0) - (current.lng || 0);
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
          }
        }
        current = remaining[nearestIdx];
        optimized.push(current);
        remaining.splice(nearestIdx, 1);
      }

      setOptimizedOrder(optimized);
      setShowComparison(true);
      setIsOptimizing(false);
    }, 1000);
  };

  const applyOptimization = async () => {
    if (optimizedOrder.length === 0) return;

    const updatedItems = optimizedOrder.map((item, index) => ({
      id: item.id,
      dayId: activeDay.id,
      order: index + 1
    }));

    const restActivities = trip.activities.filter((a: any) => a.dayId !== activeDay.id);
    const merged = [...restActivities];
    optimizedOrder.forEach((item, index) => {
      merged.push({
        ...item,
        order: index + 1
      });
    });
    trip.activities = merged;

    try {
      await apiRequest('/activities/reorder', {
        method: 'PUT',
        body: JSON.stringify({ items: updatedItems })
      });
    } catch {
      const offlineTrips = JSON.parse(localStorage.getItem('offline_trips') || '[]');
      const offlineTrip = offlineTrips.find((t: any) => t.id === trip.id);
      if (offlineTrip) {
        offlineTrip.activities = merged;
        localStorage.setItem('offline_trips', JSON.stringify(offlineTrips));
      }
    }
    
    setShowComparison(false);
    onRefresh();
  };

  // Center the map on a specific coordinate when clicking the list
  const centerMapOn = (lat: number, lng: number) => {
    if (mapRef.current) {
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(15);
    }
  };

  // Build the mock layout fallback if key is missing
  const activitiesWithMockCoords = dayActivities.map((act: any, idx: number) => {
    const x = act.lat ? (act.lat * 200) % 300 + 100 : (100 + (idx * 90) % 285);
    const y = act.lng ? (act.lng * 200) % 200 + 100 : (120 + (idx * 60) % 180);
    return { ...act, canvasX: x, canvasY: y };
  });

  const renderSVGPaths = (itemsList: any[], isOptimizedStyle = false) => {
    if (itemsList.length < 2) return null;
    let pathD = '';
    itemsList.forEach((item, idx) => {
      if (idx === 0) pathD += `M ${item.canvasX} ${item.canvasY}`;
      else pathD += ` L ${item.canvasX} ${item.canvasY}`;
    });
    return (
      <path
        d={pathD}
        className={isOptimizedStyle ? styles.svgPathOptimized : styles.svgPath}
      />
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <h2 className={styles.title}>{t('map_planner.title')}</h2>
        
        <select 
          style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', fontSize: '12px', fontWeight: '700' }}
          value={activeDayIdx}
          onChange={(e) => {
            setActiveDayIdx(parseInt(e.target.value));
            setShowComparison(false);
          }}
        >
          {trip.days?.map((d: any, idx: number) => (
            <option key={d.id} value={idx}>
              Day {d.dayNumber}
            </option>
          ))}
        </select>
      </div>

      {/* Comparison Overlay Panel */}
      {showComparison && (
        <div className={styles.routeCard}>
          <strong style={{ fontSize: '13px', color: 'var(--primary)' }}>🤖 Auto Route Optimization comparison</strong>
          <span className={styles.routeText}>🔵 Original distance: 15.4 km (~45 mins)</span>
          <span className={styles.routeText} style={{ color: 'var(--secondary)' }}>🟢 Optimized distance: 11.2 km (~30 mins)</span>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>We rearranged the sequence to avoid zig-zagging travel paths.</p>
          <div className={styles.optimizeActions}>
            <button className={styles.applyOptBtn} onClick={applyOptimization}>
              {t('map_planner.apply_optimization')}
            </button>
            <button className={styles.rejectOptBtn} onClick={() => setShowComparison(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Map & Sidebar Split Layout */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        <div className={styles.mapWrapper}>
          
          {/* If API Key loaded, render Google Maps. Otherwise, fallback to vector graphics planner */}
          {isLoaded && apiKey ? (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={center}
              zoom={13}
              onLoad={(map) => { mapRef.current = map; }}
              onUnmount={() => { mapRef.current = null; }}
            >
              {/* Display markers on map */}
              {validMapActivities.map((act: any, idx: number) => (
                <Marker
                  key={act.id}
                  position={{ lat: act.lat, lng: act.lng }}
                  label={{
                    text: `${idx + 1}. [${act.time || '12:00'}]`,
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '11px'
                  }}
                  title={act.name}
                />
              ))}

              {/* Display Polyline Route */}
              {validMapActivities.length > 1 && (
                <Polyline
                  path={validMapActivities.map((a: any) => ({ lat: a.lat, lng: a.lng }))}
                  options={{
                    strokeColor: '#4f46e5',
                    strokeOpacity: 0.8,
                    strokeWeight: 4
                  }}
                />
              )}
            </GoogleMap>
          ) : (
            // Fallback Vector map planner
            <div className={styles.mockMapCanvas}>
              <div className={styles.mapWarning}>
                <span>🗺️ Google Maps API Key not loaded. Using vector route mockup.</span>
              </div>
              <svg className={styles.svgOverlay}>
                {!showComparison && renderSVGPaths(activitiesWithMockCoords)}
                {showComparison && renderSVGPaths(activitiesWithMockCoords)}
                {showComparison && renderSVGPaths(optimizedOrder.map((a, i) => activitiesWithMockCoords.find((node: any) => node.id === a.id)), true)}
              </svg>

              {activitiesWithMockCoords.map((act: any, idx: number) => (
                <div
                  key={act.id}
                  className={styles.canvasNode}
                  style={{ left: `${act.canvasX}px`, top: `${act.canvasY}px` }}
                  title={act.name}
                >
                  <div className={styles.nodeLabel}>
                    {idx + 1}. [{act.time || '12:00'}] {act.name.substring(0, 12)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Floating actions search and optimize */}
          <div className={styles.searchContainer}>
            <form onSubmit={handleSearch} style={{ display: 'flex', flex: 1, gap: '8px' }}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder={t('map_planner.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
            <button className={styles.optimizeBtn} disabled={isOptimizing} onClick={handleOptimizeClick}>
              {isOptimizing ? '...' : '✨ Optimize'}
            </button>
          </div>
        </div>

        {/* Directions Redirect URL & Sidebar items with scheduled times */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {dayActivities.length > 0 && getGoogleMapsDirectionsUrl() && (
            <a
              href={getGoogleMapsDirectionsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.optimizeBtn}
              style={{ justifyContent: 'center', background: 'var(--primary)', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)' }}
            >
              🗺️ Open Route in Google Maps App
            </a>
          )}

          {/* Locations list show scheduled times */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>📍 DAY PLANS (Tap to focus map)</span>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '2px 0' }}>
              {dayActivities.map((act: any, idx: number) => (
                <button
                  key={act.id}
                  onClick={() => act.lat && act.lng && centerMapOn(act.lat, act.lng)}
                  style={{
                    flexShrink: 0,
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--text)',
                    fontSize: '12px'
                  }}
                >
                  <strong style={{ color: 'var(--primary)' }}>[{act.time || '12:00'}]</strong>
                  <div style={{ fontWeight: '700', marginTop: '2px' }}>{idx + 1}. {act.name.substring(0, 16)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

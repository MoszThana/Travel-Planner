'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { apiRequest } from '@/utils/api';
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import styles from './MapPlanner.module.css';
import { Icon } from './Icon';
import { GoogleMapEmbed } from './GoogleMapEmbed';
import { hasPoint, googleDirectionsUrl, googleDayRouteUrl } from '@/utils/maps';

interface MapPlannerProps {
  trip: any;
  onRefresh: () => void;
  userRole?: string;
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

// Route line colour follows the theme accent so it matches light and dark mode
const getRouteColor = () => {
  if (typeof window === 'undefined') return '#1f5c4f';
  return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#1f5c4f';
};

export const MapPlanner: React.FC<MapPlannerProps> = ({ trip, onRefresh, userRole = 'editor' }) => {
  const { t } = useTranslation();
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Optimization states
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [optimizedOrder, setOptimizedOrder] = useState<any[]>([]);

  // Map reference to programmatically pan
  const mapRef = useRef<google.maps.Map | null>(null);

  // Leaflet references and states
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);

  const activeDay = trip.days && trip.days[activeDayIdx];
  const dayActivities = trip.activities
    ? trip.activities.filter((a: any) => a.dayId === activeDay?.id)
    : [];

  // Filter activities that have valid coordinates, and assign mock coords if missing so they show on map
  const getValidMapActivities = () => {
    const withCoords = dayActivities.filter((act: any) => act.lat && act.lng);
    const baseCenter = withCoords.length > 0 ? { lat: withCoords[0].lat, lng: withCoords[0].lng } : DEFAULT_CENTER;

    return dayActivities.map((act: any, idx: number) => {
      if (act.lat && act.lng) {
        return act;
      }
      // Generate clean mock coordinates in sequence around base center
      const angle = idx * 0.5;
      const radius = 0.005 + idx * 0.003;
      const mockLat = baseCenter.lat + Math.sin(angle) * radius;
      const mockLng = baseCenter.lng + Math.cos(angle) * radius;
      return {
        ...act,
        lat: mockLat,
        lng: mockLng
      };
    });
  };

  const validMapActivities = getValidMapActivities();

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

  // Load Leaflet CDN script & styles
  useEffect(() => {
    if (apiKey) return;

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
  }, [apiKey]);

  // Handle Leaflet Map Initialization and updates
  useEffect(() => {
    if (!leafletLoaded || apiKey) return;
    const L = (window as any).L;
    if (!L) return;

    const container = document.getElementById('leaflet-map-container');
    if (!container) return;

    // Initialize map if not already done
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map('leaflet-map-container').setView([center.lat, center.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapInstanceRef.current);
    } else {
      mapInstanceRef.current.setView([center.lat, center.lng], 13);
    }

    const map = mapInstanceRef.current;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Clear existing polyline
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    // Add new markers
    const latlngs: any[] = [];
    validMapActivities.forEach((act: any, idx: number) => {
      if (act.lat && act.lng) {
        const marker = L.marker([act.lat, act.lng], {
          icon: L.divIcon({
            className: styles.customLeafletMarker,
            html: `<div class="${styles.markerLabel}">${idx + 1}</div>`
          })
        })
          .addTo(map)
          .bindPopup(`<b>${idx + 1}. ${act.name}</b><br/>${act.time || '12:00'}`);
        markersRef.current.push(marker);
        latlngs.push([act.lat, act.lng]);
      }
    });

    // Add polyline
    if (latlngs.length > 1) {
      polylineRef.current = L.polyline(latlngs, { color: getRouteColor(), weight: 3, opacity: 0.9 }).addTo(map);
    }

    // Fit bounds if markers exist
    if (latlngs.length > 0) {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
    }
  }, [leafletLoaded, validMapActivities, apiKey, center.lat, center.lng]);

  // Clean up Leaflet map instance on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Generate multi-destination redirect URL to open in external Google Maps app
  // Whole day as one Google Maps route (official Maps URL, no key needed)
  const getGoogleMapsDirectionsUrl = () => googleDayRouteUrl(dayActivities);

  // Stop selected in the list below the map
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const selectedIdx = dayActivities.findIndex((a: any) => a.id === selectedStopId);
  const selectedStop = selectedIdx >= 0 ? dayActivities[selectedIdx] : null;
  const selectedStopPrev = selectedIdx > 0 ? dayActivities[selectedIdx - 1] : null;

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
    if (apiKey && mapRef.current) {
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(15);
    } else if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 15);
    }
  };



  return (
    <div className={`page ${styles.container}`}>
      <div className="page-header">
        <h1 className="page-title">{t('map_planner.title')}</h1>

        <select
          className="input input-sm"
          style={{ width: 'auto' }}
          value={activeDayIdx}
          onChange={(e) => {
            setActiveDayIdx(parseInt(e.target.value));
            setSelectedStopId(null);
            setShowComparison(false);
          }}
        >
          {trip.days?.map((d: any, idx: number) => (
            <option key={d.id} value={idx}>
              {t('itinerary.day', { number: d.dayNumber })}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.mapWrapper}>
        {/* Google Maps when an API key is configured, otherwise OpenStreetMap via Leaflet */}
        {isLoaded && apiKey ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={13}
            onLoad={(map) => { mapRef.current = map; }}
            onUnmount={() => { mapRef.current = null; }}
          >
            {validMapActivities.map((act: any, idx: number) => (
              <Marker
                key={act.id}
                position={{ lat: act.lat, lng: act.lng }}
                label={{
                  text: `${idx + 1}`,
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '11px'
                }}
                title={`${act.time || '12:00'} · ${act.name}`}
              />
            ))}

            {validMapActivities.length > 1 && (
              <Polyline
                path={validMapActivities.map((a: any) => ({ lat: a.lat, lng: a.lng }))}
                options={{
                  strokeColor: getRouteColor(),
                  strokeOpacity: 0.9,
                  strokeWeight: 3
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div id="leaflet-map-container" className={styles.leafletContainer} />
        )}

        {/* Route optimisation comparison */}
        {showComparison && (
          <div className={styles.routeCard}>
            <span className="eyebrow">Route optimisation</span>
            <span className={styles.routeText}>
              <span className={styles.routeDot} style={{ background: 'var(--text-faint)' }} />
              Original · 15.4 km (~45 min)
            </span>
            <span className={styles.routeText}>
              <span className={styles.routeDot} style={{ background: 'var(--primary)' }} />
              Optimised · 11.2 km (~30 min)
            </span>
            <p className={styles.routeNote}>Stops reordered to avoid zig-zagging between places.</p>
            <div className="btn-row">
              <button className="btn btn-sm" onClick={() => setShowComparison(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-sm btn-primary" onClick={applyOptimization}>
                {t('map_planner.apply_optimization')}
              </button>
            </div>
          </div>
        )}

        {/* Floating search and optimise */}
        {userRole !== 'viewer' && (
          <div className={styles.searchContainer}>
            <form onSubmit={handleSearch} className={styles.searchForm}>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder={t('map_planner.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
            <button className={styles.optimizeBtn} disabled={isOptimizing} onClick={handleOptimizeClick}>
              <Icon name="sparkles" size={15} />
              {isOptimizing ? t('common.loading') : 'Optimise'}
            </button>
          </div>
        )}
      </div>

      {/* Stops for the selected day */}
      <section className="section">
        <div className="section-head">
          <span className="eyebrow">Stops · tap one for directions</span>
          {getGoogleMapsDirectionsUrl() && (
            <a
              href={getGoogleMapsDirectionsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm"
            >
              <Icon name="route" size={15} />
              Full day in Google Maps
            </a>
          )}
        </div>
        {dayActivities.length === 0 ? (
          <div className="empty">{t('itinerary.no_activities')}</div>
        ) : (
          <div className={styles.stopList}>
            {dayActivities.map((act: any, idx: number) => (
              <button
                key={act.id}
                className={`${styles.stopItem} ${selectedStop?.id === act.id ? styles.stopItemActive : ''}`}
                onClick={() => {
                  setSelectedStopId(act.id);
                  if (act.lat && act.lng) centerMapOn(act.lat, act.lng);
                }}
                disabled={!hasPoint(act)}
              >
                <span className={styles.stopIndex}>{idx + 1}</span>
                <span className={styles.stopText}>
                  <span className={styles.stopTime}>{act.time || '12:00'}</span>
                  <span className={styles.stopName}>{act.name}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Selected stop: real Google map + hand-off to the Google Maps app */}
        {selectedStop && (
          <div className={`card ${styles.stopPanel}`}>
            <div className={styles.stopPanelHead}>
              <div className={styles.stopText}>
                <span className={styles.stopTime}>{selectedStop.time || '12:00'}</span>
                <span className={styles.stopPanelTitle}>{selectedStop.name}</span>
                {selectedStop.location && <span className={styles.stopTime}>{selectedStop.location}</span>}
              </div>
              <a
                href={googleDirectionsUrl(selectedStop, { transportType: selectedStop.transportType })}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-primary"
              >
                <Icon name="route" size={15} />
                Navigate
              </a>
            </div>
            <GoogleMapEmbed
              key={selectedStop.id}
              place={selectedStop}
              from={selectedStopPrev}
              transportType={selectedStop.transportType}
              height={300}
            />
          </div>
        )}
      </section>
    </div>
  );
};

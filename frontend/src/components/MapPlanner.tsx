'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { apiRequest, showError } from '@/utils/api';
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

const escapeHtml = (value: string): string =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Straight-line distance between two pinned stops (haversine), in km
const distanceKm = (a: any, b: any): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

const routeKm = (stops: any[]): number =>
  stops.slice(1).reduce((sum, stop, i) => sum + distanceKm(stops[i], stop), 0);

export const MapPlanner: React.FC<MapPlannerProps> = ({ trip, onRefresh, userRole = 'editor' }) => {
  const { t } = useTranslation();
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Optimization states
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [optimizedOrder, setOptimizedOrder] = useState<any[]>([]);
  const [routeStats, setRouteStats] = useState<{ originalKm: number; optimizedKm: number } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Map reference to programmatically pan
  const mapRef = useRef<google.maps.Map | null>(null);

  // Leaflet references and states
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);

  const activeDay = trip.days && trip.days[activeDayIdx];
  const dayActivities = useMemo(
    () => (trip.activities ? trip.activities.filter((a: any) => a.dayId === activeDay?.id) : []),
    [trip.activities, activeDay?.id]
  );

  // Only stops with a real map pin are drawn; stopNumber keeps the number shown in the stop list
  const validMapActivities = useMemo(
    () => dayActivities
      .map((act: any, idx: number) => ({ ...act, stopNumber: idx + 1 }))
      .filter((act: any) => act.lat != null && act.lng != null),
    [dayActivities]
  );

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
    validMapActivities.forEach((act: any) => {
      if (act.lat != null && act.lng != null) {
        const marker = L.marker([act.lat, act.lng], {
          icon: L.divIcon({
            className: styles.customLeafletMarker,
            html: `<div class="${styles.markerLabel}">${act.stopNumber}</div>`
          })
        })
          .addTo(map)
          // Names come from trip members: escape them, never insert raw HTML
          .bindPopup(`<b>${act.stopNumber}. ${escapeHtml(act.name)}</b><br/>${escapeHtml(act.time || '')}`);
        markersRef.current.push(marker);
        latlngs.push([act.lat, act.lng]);
      }
    });

    // Add polyline
    if (latlngs.length > 1) {
      // Dashed: this connects stops in a straight line, it is not the real road/transit route
      polylineRef.current = L.polyline(latlngs, { color: getRouteColor(), weight: 2.5, opacity: 0.8, dashArray: '6 8' }).addTo(map);
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

  // Find the place with OpenStreetMap search, then add it to this day at its real location
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query || !activeDay) return;

    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({
        format: 'json',
        limit: '1',
        q: [query, trip.destination].filter(Boolean).join(', '),
      })}`);
      let results = res.ok ? await res.json() as any[] : [];
      if (results.length === 0) {
        // Retry without the destination (e.g. a place outside the main city)
        const retry = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: 'json', limit: '1', q: query })}`);
        results = retry.ok ? await retry.json() as any[] : [];
      }
      const place = results[0];
      if (!place) {
        showError(null, t('map.not_found', { query }));
        return;
      }

      // New stop goes after the last one, an hour later
      const lastTime = dayActivities[dayActivities.length - 1]?.time as string | undefined;
      const [h, m] = (lastTime || '11:00').split(':').map(Number);
      const nextHour = Math.min((Number.isFinite(h) ? h : 11) + 1, 23);

      await apiRequest('/activities', {
        method: 'POST',
        body: JSON.stringify({
          dayId: activeDay.id,
          name: place.name || query,
          time: `${String(nextHour).padStart(2, '0')}:${String(Number.isFinite(m) ? m : 0).padStart(2, '0')}`,
          location: place.display_name?.split(',').slice(0, 2).join(',') || query,
          lat: parseFloat(place.lat),
          lng: parseFloat(place.lon),
          transportType: 'walk',
          estCost: 0,
          costCategory: 'activity',
          order: dayActivities.length + 1
        })
      });
      setSearchQuery('');
      onRefresh();
    } catch (err) {
      showError(err, t('map.add_failed'));
    } finally {
      setIsSearching(false);
    }
  };

  const handleOptimizeClick = () => {
    if (dayActivities.length < 3) {
      showError(null, t('map.need_three'));
      return;
    }
    const unpinned = dayActivities.filter((a: any) => a.lat == null || a.lng == null);
    if (unpinned.length > 0) {
      showError(null, t('map.unpinned', { count: unpinned.length, names: unpinned.map((a: any) => a.name).join(', ') }));
      return;
    }

    // Nearest-neighbour order from the first stop (the day's starting point stays first)
    const original = [...dayActivities];
    const optimized = [original[0]];
    const remaining = original.slice(1);
    let current = original[0];
    while (remaining.length > 0) {
      let nearestIdx = 0;
      let minDist = Infinity;
      remaining.forEach((stop: any, i: number) => {
        const dist = distanceKm(current, stop);
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = i;
        }
      });
      current = remaining[nearestIdx];
      optimized.push(current);
      remaining.splice(nearestIdx, 1);
    }

    const originalKm = routeKm(original);
    const optimizedKm = routeKm(optimized);
    if (optimizedKm >= originalKm - 0.1) {
      showError(null, t('map.already_shortest', { km: originalKm.toFixed(1) }));
      return;
    }

    setOptimizedOrder(optimized);
    setRouteStats({ originalKm, optimizedKm });
    setShowComparison(true);
  };

  const applyOptimization = async () => {
    if (optimizedOrder.length === 0) return;

    setIsOptimizing(true);
    try {
      await apiRequest('/activities/reorder', {
        method: 'PUT',
        body: JSON.stringify({
          items: optimizedOrder.map((item, index) => ({ id: item.id, dayId: activeDay.id, order: index + 1 }))
        })
      });
      setShowComparison(false);
      onRefresh();
    } catch (err) {
      showError(err, t('map.reorder_failed'));
    } finally {
      setIsOptimizing(false);
    }
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
            {validMapActivities.map((act: any) => (
              <Marker
                key={act.id}
                position={{ lat: act.lat, lng: act.lng }}
                label={{
                  text: String(act.stopNumber),
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
                  // Dashed straight line (Google draws dashes as repeated line symbols)
                  strokeColor: getRouteColor(),
                  strokeOpacity: 0,
                  icons: [{
                    icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, strokeWeight: 2.5, scale: 3 },
                    offset: '0',
                    repeat: '14px'
                  }]
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div id="leaflet-map-container" className={styles.leafletContainer} />
        )}

        {/* Explain that the overview line is not the real route */}
        {!showComparison && validMapActivities.length > 1 && (
          <div className={styles.lineNote}>
            <span className={styles.lineSample} />
            {t('map.line_note')}
          </div>
        )}

        {/* Route optimisation comparison */}
        {showComparison && (
          <div className={styles.routeCard}>
            <span className="eyebrow">{t('map.optimise_title')}</span>
            <span className={styles.routeText}>
              <span className={styles.routeDot} style={{ background: 'var(--text-faint)' }} />
              {t('map.current_order', { km: routeStats ? routeStats.originalKm.toFixed(1) : '' })}
            </span>
            <span className={styles.routeText}>
              <span className={styles.routeDot} style={{ background: 'var(--primary)' }} />
              {t('map.suggested_order', { km: routeStats ? routeStats.optimizedKm.toFixed(1) : '' })}
              {routeStats && ` ${t('map.saves', { km: (routeStats.originalKm - routeStats.optimizedKm).toFixed(1) })}`}
            </span>
            <p className={styles.routeNote}>
              {t('map.new_order', { order: optimizedOrder.map((a: any) => a.name).join(' → ') })}
            </p>
            <div className="btn-row">
              <button className="btn btn-sm" onClick={() => setShowComparison(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-sm btn-primary" onClick={applyOptimization} disabled={isOptimizing}>
                {isOptimizing ? t('common.loading') : t('map_planner.apply_optimization')}
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
                placeholder={isSearching ? t('map.searching') : t('map.find_place')}
                value={searchQuery}
                disabled={isSearching}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
            <button className={styles.optimizeBtn} onClick={handleOptimizeClick} title={t('map.optimise_hint')}>
              <Icon name="route" size={15} />
              {t('map.optimise')}
            </button>
          </div>
        )}
      </div>

      {/* Stops for the selected day */}
      <section className="section">
        <div className="section-head">
          <span className="eyebrow">{t('map.stops')}</span>
          {getGoogleMapsDirectionsUrl() && (
            <a
              href={getGoogleMapsDirectionsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm"
            >
              <Icon name="route" size={15} />
              {t('map.full_day')}
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
                {t('map.navigate')}
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

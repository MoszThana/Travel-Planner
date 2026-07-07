'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { apiRequest } from '@/utils/api';
import styles from './MapPlanner.module.css';

interface MapPlannerProps {
  trip: any;
  onRefresh: () => void;
}

export const MapPlanner: React.FC<MapPlannerProps> = ({ trip, onRefresh }) => {
  const { t } = useTranslation();
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Optimization UI states
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [optimizedOrder, setOptimizedOrder] = useState<any[]>([]);
  
  const activeDay = trip.days && trip.days[activeDayIdx];
  const dayActivities = trip.activities
    ? trip.activities.filter((a: any) => a.dayId === activeDay?.id)
    : [];

  // Auto-generate coordinates for mock canvas display if they are empty
  const activitiesWithCoords = dayActivities.map((act: any, idx: number) => {
    // If coordinates exist, use them, otherwise mock a spread for canvas layout
    const x = act.lat ? (act.lat * 200) % 300 + 100 : (100 + (idx * 90) % 280);
    const y = act.lng ? (act.lng * 200) % 200 + 100 : (120 + (idx * 60) % 180);
    return {
      ...act,
      canvasX: x,
      canvasY: y
    };
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery || !activeDay) return;

    // Simulate finding a place and adding it to the itinerary
    alert(`Found: "${searchQuery}"! Adding place to Day ${activeDay.dayNumber}.`);
    
    const payload = {
      dayId: activeDay.id,
      name: searchQuery,
      time: '14:30',
      location: searchQuery,
      lat: 35.65 + (Math.random() - 0.5) * 0.05,
      lng: 139.70 + (Math.random() - 0.5) * 0.05,
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
    // Simulate API logic: optimize based on closest coordinate path
    setTimeout(() => {
      // Create a mocked optimized order (e.g. sorted by distance, here simulated by swapping items)
      const original = [...activitiesWithCoords];
      const optimized = [original[0]]; // Keep start point same
      const remaining = original.slice(1);
      
      // Greedy nearest-neighbor simulation on canvas coordinates
      let current = original[0];
      while (remaining.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const dx = remaining[i].canvasX - current.canvasX;
          const dy = remaining[i].canvasY - current.canvasY;
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
    }, 1200);
  };

  const applyOptimization = async () => {
    if (optimizedOrder.length === 0) return;

    const updatedItems = optimizedOrder.map((item, index) => ({
      id: item.id,
      dayId: activeDay.id,
      order: index + 1
    }));

    // Update local copy
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
      // Offline fallback
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

  // Helper to build SVG lines overlay
  const renderSVGPaths = (itemsList: any[], isOptimizedStyle = false) => {
    if (itemsList.length < 2) return null;
    let pathD = '';
    itemsList.forEach((item, idx) => {
      if (idx === 0) {
        pathD += `M ${item.canvasX} ${item.canvasY}`;
      } else {
        pathD += ` L ${item.canvasX} ${item.canvasY}`;
      }
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
        
        {/* Day Selectors */}
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

      {/* Map Canvas Wrapper */}
      <div className={styles.mapWrapper}>
        <div className={styles.mapWarning}>
          <span>🗺️ {t('map_planner.no_key_warning')}</span>
        </div>

        {/* Vector Mock Map */}
        <div className={styles.mockMapCanvas}>
          {/* Path connection overlays */}
          <svg className={styles.svgOverlay}>
            {/* Draw original route */}
            {!showComparison && renderSVGPaths(activitiesWithCoords)}
            
            {/* Compare overlay routes */}
            {showComparison && renderSVGPaths(activitiesWithCoords)}
            {showComparison && renderSVGPaths(optimizedOrder, true)}
          </svg>

          {/* Render pin dots */}
          {activitiesWithCoords.map((act: any, idx: number) => (
            <div
              key={act.id}
              className={styles.canvasNode}
              style={{ left: `${act.canvasX}px`, top: `${act.canvasY}px` }}
              title={act.name}
            >
              <div className={styles.nodeLabel}>
                {idx + 1}. {act.name.substring(0, 15)}
              </div>
            </div>
          ))}
        </div>

        {/* Floating actions on Map */}
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
    </div>
  );
};

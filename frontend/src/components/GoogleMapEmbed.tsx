'use client';

import React, { useState } from 'react';
import styles from './GoogleMapEmbed.module.css';
import { Icon } from './Icon';
import {
  MapPoint,
  hasPoint,
  googleDirectionsUrl,
  googleEmbedPlaceUrl,
  googleEmbedRouteUrl,
  googlePlaceUrl,
} from '@/utils/maps';

interface GoogleMapEmbedProps {
  place: MapPoint;
  // Previous stop; when given, the user can switch to the route from it
  from?: MapPoint | null;
  transportType?: string | null;
  height?: number;
}

// Real Google map (no API key) for one activity, with a place / route switch.
export const GoogleMapEmbed: React.FC<GoogleMapEmbedProps> = ({ place, from, transportType, height = 240 }) => {
  const canRoute = hasPoint(from);
  const [view, setView] = useState<'place' | 'route'>(canRoute ? 'route' : 'place');

  const src = view === 'route' && canRoute
    ? googleEmbedRouteUrl(from as MapPoint, place, transportType)
    : googleEmbedPlaceUrl(place);

  const openUrl = view === 'route' && canRoute
    ? googleDirectionsUrl(place, { origin: from, transportType })
    : googlePlaceUrl(place);

  return (
    <div className={styles.wrapper}>
      {canRoute && (
        <div className={`segmented ${styles.switch}`}>
          <button type="button" className={view === 'route' ? 'active' : ''} onClick={() => setView('route')}>
            Route from previous
          </button>
          <button type="button" className={view === 'place' ? 'active' : ''} onClick={() => setView('place')}>
            Place
          </button>
        </div>
      )}

      <iframe
        key={src}
        src={src}
        title={`Google Maps: ${place.name || place.location || 'location'}`}
        className={styles.frame}
        style={{ height }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />

      <a href={openUrl} target="_blank" rel="noopener noreferrer" className={styles.openLink}>
        Open in Google Maps
        <Icon name="arrowUpRight" size={13} />
      </a>
    </div>
  );
};

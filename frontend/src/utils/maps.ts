// Google Maps helpers that work WITHOUT an API key or billing account.
//
// - Navigation links use the official "Maps URLs" format
//   (https://developers.google.com/maps/documentation/urls/get-started).
//   On phones they open the Google Maps app; on desktop, google.com/maps.
// - Embedded maps use the "Share → Embed a map" iframe (output=embed).
//   It needs no key, but it is not an official API, so callers should always
//   offer an "Open in Google Maps" link alongside it.

export interface MapPoint {
  name?: string;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
}

type TravelMode = 'walking' | 'driving' | 'transit' | 'bicycling';

// Activity transport type → Google travel mode
export const toTravelMode = (transportType?: string | null): TravelMode => {
  switch (transportType) {
    case 'walk':
      return 'walking';
    case 'train':
    case 'bus':
      return 'transit';
    default:
      return 'driving';
  }
};

// Legacy embed flag for the same modes
const toDirFlag = (mode: TravelMode) =>
  ({ walking: 'w', driving: 'd', transit: 'r', bicycling: 'b' }[mode]);

// Coordinates are the most precise; fall back to the typed location (never the activity name)
export const pointQuery = (p: MapPoint): string => {
  if (p.lat != null && p.lng != null && !isNaN(Number(p.lat)) && !isNaN(Number(p.lng))) {
    return `${p.lat},${p.lng}`;
  }
  return (p.location || '').trim();
};

export const hasPoint = (p?: MapPoint | null): boolean => !!p && pointQuery(p) !== '';

/** Directions in the Google Maps app. Without an origin, Google starts from the user's current location. */
export const googleDirectionsUrl = (
  destination: MapPoint,
  options: { origin?: MapPoint | null; waypoints?: MapPoint[]; transportType?: string | null } = {}
): string => {
  const params = new URLSearchParams({ api: '1', destination: pointQuery(destination) });
  if (options.origin && hasPoint(options.origin)) params.set('origin', pointQuery(options.origin));
  const waypoints = (options.waypoints || []).filter(hasPoint).map(pointQuery);
  if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'));
  params.set('travelmode', toTravelMode(options.transportType));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

/** A whole day's stops in order, as one Google Maps route. */
export const googleDayRouteUrl = (stops: MapPoint[], transportType?: string | null): string => {
  const valid = stops.filter(hasPoint);
  if (valid.length === 0) return '';
  if (valid.length === 1) return googleDirectionsUrl(valid[0], { transportType });
  return googleDirectionsUrl(valid[valid.length - 1], {
    origin: valid[0],
    waypoints: valid.slice(1, -1),
    transportType,
  });
};

/** Open a single place in Google Maps. */
export const googlePlaceUrl = (p: MapPoint): string =>
  `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: pointQuery(p) }).toString()}`;

/** Embeddable Google map of one place (no key needed). */
export const googleEmbedPlaceUrl = (p: MapPoint, zoom = 15): string =>
  `https://www.google.com/maps?${new URLSearchParams({ q: pointQuery(p), z: String(zoom), output: 'embed' }).toString()}`;

/** Embeddable Google map of a route from A to B (no key needed). */
export const googleEmbedRouteUrl = (origin: MapPoint, destination: MapPoint, transportType?: string | null): string =>
  `https://www.google.com/maps?${new URLSearchParams({
    saddr: pointQuery(origin),
    daddr: pointQuery(destination),
    dirflg: toDirFlag(toTravelMode(transportType)),
    output: 'embed',
  }).toString()}`;

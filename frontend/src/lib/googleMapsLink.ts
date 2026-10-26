// Read a place (name and/or coordinates) out of a Google Maps link.
// Handles long links (google.com/maps/place/..., ?q=..., @lat,lng) and the short
// share links (maps.app.goo.gl, goo.gl/maps, g.co) by following their redirects.

export interface LinkPlace {
  name: string | null;
  lat: number | null;
  lng: number | null;
}

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);
const MAX_REDIRECTS = 6;

const isGoogleHost = (host: string) => /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host);
const isShortHost = (host: string) => SHORT_HOSTS.has(host);

/** First Google Maps URL inside pasted text (share text often has the place name before the link). */
export function findMapsUrl(text: string): URL | null {
  for (const match of text.match(/https?:\/\/[^\s<>"']+/g) || []) {
    try {
      const url = new URL(match);
      const host = url.hostname.toLowerCase();
      if (isShortHost(host) || (isGoogleHost(host) && /\/maps|[?&](q|query)=/.test(url.pathname + url.search)) || host.startsWith('maps.google.')) {
        return url;
      }
    } catch {
      // not a URL
    }
  }
  return null;
}

const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

const validPoint = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const cleanName = (raw: string) => {
  const name = safeDecode(raw.replace(/\+/g, ' ')).trim();
  return name && !COORDS.test(name) ? name : null;
};

/** Parse a full Google Maps URL. Returns null when it has neither a name nor coordinates. */
export function parseMapsUrl(url: URL): LinkPlace | null {
  const full = safeDecode(url.href);
  let lat: number | null = null;
  let lng: number | null = null;

  // Most precise first: the place's own pin (!3d<lat>!4d<lng>), then query coordinates, then the map centre (@lat,lng)
  const pin = full.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const queryCoords = ['q', 'query', 'll', 'destination', 'center']
    .map((key) => url.searchParams.get(key)?.match(COORDS))
    .find(Boolean);
  const centre = full.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const point = pin || queryCoords || centre;
  if (point && validPoint(parseFloat(point[1]), parseFloat(point[2]))) {
    lat = parseFloat(point[1]);
    lng = parseFloat(point[2]);
  }

  let name: string | null = null;
  const place = url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/);
  if (place) name = cleanName(place[1]);
  if (!name) {
    const q = url.searchParams.get('q') || url.searchParams.get('query');
    if (q) name = cleanName(q);
  }

  return name || lat != null ? { name, lat, lng } : null;
}

/**
 * Resolve a pasted Google Maps link to a place. Short links are followed one hop at a
 * time and only while every hop stays on Google, so this can't be used to fetch other sites.
 */
export async function resolveMapsLink(start: URL): Promise<LinkPlace | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = url.hostname.toLowerCase();

    // EU consent pages wrap the real link in ?continue=
    if (host === 'consent.google.com') {
      const next = url.searchParams.get('continue');
      if (!next) return null;
      url = new URL(next);
      continue;
    }

    if (!isShortHost(host)) {
      if (!isGoogleHost(host) && !host.startsWith('maps.google.')) return null;
      return parseMapsUrl(url);
    }

    const res = await fetch(url.href, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (TravelPlanner link reader)' } });
    const location = res.headers.get('location');
    if (!location || res.status < 300 || res.status >= 400) return null;
    url = new URL(location, url);
  }
  return null;
}

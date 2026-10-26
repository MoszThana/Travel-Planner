'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { apiRequest, showSuccess } from '@/utils/api';
import { currencySymbol } from '@/utils/money';
import { googlePlaceUrl } from '@/utils/maps';
import { useEscape } from '@/utils/useEscape';
import { findMapsUrl } from '@/lib/googleMapsLink';
import { Icon, TRANSPORT_ICONS, CATEGORY_ICONS } from './Icon';
import styles from './ActivityForm.module.css';

interface ActivityFormProps {
  trip: any;
  day: any;
  dayNumber: number;
  dayActivities: any[];
  activity?: any | null; // set when editing
  onClose: () => void;
  onSaved: () => void;
}

interface Suggestion {
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string | null;
}

const TRANSPORTS = ['walk', 'train', 'bus', 'car', 'flight', 'other'];
const CATEGORIES = ['food', 'activity', 'hotel', 'transport', 'shopping', 'emergency', 'other'];
const BANGKOK = { lat: 13.7563, lng: 100.5018 };

// Trip destination → map centre, looked up once per destination
const destinationCache = new Map<string, { lat: number; lng: number } | null>();

async function geocodeDestination(destination: string) {
  const key = destination.trim().toLowerCase();
  if (destinationCache.has(key)) return destinationCache.get(key) || null;
  let point: { lat: number; lng: number } | null = null;
  try {
    const q = destination.split(',')[0].trim() || destination;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: 'jsonv2', q, limit: '1' })}`);
    const [hit] = (await res.json()) as any[];
    if (hit) point = { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
  } catch {
    point = null;
  }
  destinationCache.set(key, point);
  return point;
}

// OpenStreetMap place type → our cost category
function guessCategory(osmClass: string, osmType: string): string | null {
  if (osmClass === 'amenity') {
    if (['restaurant', 'cafe', 'fast_food', 'food_court', 'bar', 'pub', 'ice_cream', 'biergarten'].includes(osmType)) return 'food';
    if (['bus_station', 'ferry_terminal', 'taxi', 'car_rental'].includes(osmType)) return 'transport';
    if (['hospital', 'clinic', 'pharmacy', 'police', 'doctors'].includes(osmType)) return 'emergency';
    if (['place_of_worship', 'theatre', 'cinema', 'arts_centre'].includes(osmType)) return 'activity';
    if (osmType === 'marketplace') return 'shopping';
  }
  if (osmClass === 'tourism') {
    if (['hotel', 'hostel', 'guest_house', 'motel', 'apartment', 'chalet', 'camp_site'].includes(osmType)) return 'hotel';
    return 'activity';
  }
  if (['historic', 'leisure'].includes(osmClass)) return 'activity';
  if (['railway', 'aeroway', 'public_transport'].includes(osmClass)) return 'transport';
  if (osmClass === 'shop') return osmType === 'bakery' || osmType === 'confectionery' ? 'food' : 'shopping';
  return null;
}

// OpenStreetMap names can hold several spellings ("A;B") - show the first
const placeName = (item: any) => String(item.name || String(item.display_name || '').split(',')[0]).split(';')[0].trim();

// Short "district, city, country" line from a Nominatim address (street names are often in the local script)
function shortAddress(item: any): string {
  const a = item.address || {};
  const name = placeName(item);
  const parts = [
    a.suburb || a.city_district || a.quarter || a.neighbourhood,
    a.city || a.town || a.village || a.county || a.state,
    a.country,
  ].filter((v, i, all) => v && v !== name && all.indexOf(v) === i);
  return parts.join(', ') || String(item.display_name || '').split(',').slice(1, 4).join(',').trim();
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (minutes: number) => {
  const m = Math.min(Math.max(minutes, 0), 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// First stop of the day starts at 09:00; later stops 1 hour after the latest one
function nextTime(activities: any[], after?: string) {
  const times = activities.map((a) => a.time).filter((v) => /^\d{1,2}:\d{2}$/.test(v || ''));
  if (after) times.push(after);
  if (times.length === 0) return '09:00';
  return toHHMM(Math.max(...times.map(toMinutes)) + 60);
}

export const ActivityForm: React.FC<ActivityFormProps> = ({ trip, day, dayNumber, dayActivities, activity, onClose, onSaved }) => {
  const { t, locale } = useTranslation();
  const editing = !!activity;
  const currency = trip.currency || 'THB';

  const [where, setWhere] = useState(activity?.location || '');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(activity?.lat != null ? parseFloat(activity.lat) : null);
  const [lng, setLng] = useState<number | null>(activity?.lng != null ? parseFloat(activity.lng) : null);
  const [name, setName] = useState(activity?.name || '');
  const [time, setTime] = useState(activity ? activity.time || '' : nextTime(dayActivities));
  const [transportType, setTransportType] = useState(activity?.transportType || 'walk');
  const [estCost, setEstCost] = useState(activity?.estCost ? String(activity.estCost) : '');
  const [costCategory, setCostCategory] = useState(activity?.costCategory || 'other');
  const [notes, setNotes] = useState(activity?.notes || '');
  const [detailsOpen, setDetailsOpen] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [readingLink, setReadingLink] = useState(false);
  const [noResults, setNoResults] = useState(false);

  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  const settledRef = useRef<string>(activity?.location || ''); // text of the chosen place - no need to search it
  const autoNameRef = useRef(''); // name filled in from a picked place, replaced when another place is picked
  const categoryTouchedRef = useRef(editing);
  const lastOrderRef = useRef(0);
  const whereInputRef = useRef<HTMLInputElement>(null);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEscape(onClose, !saving);

  // Map/search centre: this activity, the day's last pinned stop, any pinned stop, then the destination
  useEffect(() => {
    const pinned = (list: any[]) => [...list].reverse().find((a) => a.lat != null && a.lng != null);
    const near = (activity?.lat != null && activity) || pinned(dayActivities) || pinned(trip.activities || []);
    if (near) {
      setCenter({ lat: parseFloat(near.lat), lng: parseFloat(near.lng) });
      return;
    }
    let cancelled = false;
    geocodeDestination(trip.destination || '').then((point) => {
      if (!cancelled) setCenter(point || BANGKOK);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Put the cursor in the search box when adding
  useEffect(() => {
    if (!editing) whereInputRef.current?.focus();
  }, [editing]);

  // Load Leaflet only when the map is shown
  useEffect(() => {
    if (!detailsOpen) return;
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
    script.onload = () => setLeafletLoaded(true);
    document.head.appendChild(script);
  }, [detailsOpen]);

  // Pick a spot on the map
  useEffect(() => {
    const L = (window as any).L;
    if (!detailsOpen || !leafletLoaded || !L || !mapBoxRef.current || !center) return;

    const start = lat != null && lng != null ? { lat, lng } : center;
    const map = L.map(mapBoxRef.current).setView([start.lat, start.lng], lat != null ? 15 : 12);
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    if (lat != null && lng != null) markerRef.current = L.marker([lat, lng]).addTo(map);

    map.on('click', async (e: any) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      setLat(clickLat);
      setLng(clickLng);
      if (markerRef.current) markerRef.current.setLatLng(e.latlng);
      else markerRef.current = L.marker(e.latlng).addTo(map);

      // Name the spot that was tapped
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({
          format: 'jsonv2', lat: String(clickLat), lon: String(clickLng), 'accept-language': locale === 'th' ? 'th,en' : 'en',
        })}`);
        const data = (await res.json()) as any;
        if (data) {
          const label = (data.name && placeName(data)) || data.address?.road || data.address?.suburb || data.address?.city || '';
          if (label) {
            settledRef.current = label;
            setWhere(label);
            setAddress(shortAddress(data));
          }
        }
      } catch {
        // keep the pin without a name
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailsOpen, leafletLoaded, center]);

  // Search places near the trip (or read a pasted Google Maps link)
  useEffect(() => {
    setNoResults(false);
    const text = where.trim();
    if (text && text === settledRef.current.trim()) {
      setShowSuggestions(false);
      return;
    }

    if (findMapsUrl(text)) {
      setShowSuggestions(false);
      readGoogleLink(text);
      return;
    }
    if (text.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params: Record<string, string> = {
          format: 'jsonv2',
          q: text,
          limit: '6',
          addressdetails: '1',
          'accept-language': locale === 'th' ? 'th,en' : 'en',
        };
        if (center) {
          // Prefer results around the trip, without excluding the rest of the world
          const d = 0.6;
          params.viewbox = [center.lng - d, center.lat + d, center.lng + d, center.lat - d].join(',');
        }
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams(params)}`);
        const data = ((await res.json()) as any[]) || [];
        const list: Suggestion[] = [];
        for (const item of data) {
          const s: Suggestion = {
            name: placeName(item),
            address: shortAddress(item),
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            category: guessCategory(item.category, item.type),
          };
          // Same name a few hundred metres apart is the same place
          const dup = list.find((o) => o.name === s.name && Math.abs(o.lat - s.lat) < 0.004 && Math.abs(o.lng - s.lng) < 0.004);
          if (dup) dup.category = dup.category || s.category;
          else list.push(s);
        }
        setSuggestions(list);
        setShowSuggestions(list.length > 0);
        setNoResults(list.length === 0);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [where]);

  const placePin = (pinLat: number, pinLng: number) => {
    setLat(pinLat);
    setLng(pinLng);
    const L = (window as any).L;
    if (mapRef.current && L) {
      mapRef.current.setView([pinLat, pinLng], 15);
      if (markerRef.current) markerRef.current.setLatLng([pinLat, pinLng]);
      else markerRef.current = L.marker([pinLat, pinLng]).addTo(mapRef.current);
    }
  };

  const fillName = (placeName: string) => {
    if (!name.trim() || name === autoNameRef.current) {
      setName(placeName);
      autoNameRef.current = placeName;
    }
  };

  const pickSuggestion = (s: Suggestion) => {
    settledRef.current = s.name;
    setWhere(s.name);
    setAddress(s.address);
    setShowSuggestions(false);
    placePin(s.lat, s.lng);
    fillName(s.name);
    if (s.category && !categoryTouchedRef.current) setCostCategory(s.category);
  };

  const readGoogleLink = async (text: string) => {
    setReadingLink(true);
    setFormError('');
    try {
      const place = await apiRequest('/places/google-link', { method: 'POST', body: JSON.stringify({ text }) });
      if (place.lat != null && place.lng != null) {
        const label = place.name || `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
        settledRef.current = label;
        setWhere(label);
        setAddress(t('activityform.from_link'));
        placePin(place.lat, place.lng);
        if (place.name) fillName(place.name);
      } else if (place.name) {
        // Name only: search for it near the trip
        settledRef.current = '';
        setWhere(place.name);
      }
    } catch {
      setFormError(t('activityform.link_failed'));
    } finally {
      setReadingLink(false);
    }
  };

  const clearPlace = () => {
    setWhere('');
    setAddress('');
    setLat(null);
    setLng(null);
    markerRef.current?.remove();
    markerRef.current = null;
    whereInputRef.current?.focus();
  };

  const save = async (addAnother: boolean) => {
    setFormError('');
    const finalName = name.trim() || where.trim();
    if (!finalName) {
      setFormError(t('activityform.need_name'));
      whereInputRef.current?.focus();
      return;
    }

    setSaving(true);
    const maxOrder = Math.max(0, lastOrderRef.current, ...dayActivities.map((a) => Number(a.order) || 0));
    const payload = {
      dayId: day.id,
      name: finalName,
      time,
      notes,
      location: where.trim(),
      lat,
      lng,
      transportType,
      estCost: parseFloat(estCost) || 0,
      costCategory,
      order: editing ? activity.order : maxOrder + 1,
    };

    try {
      if (editing) {
        await apiRequest(`/activities/${activity.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiRequest('/activities', { method: 'POST', body: JSON.stringify(payload) });
        lastOrderRef.current = maxOrder + 1;
      }
    } catch (err) {
      // Keep the form open so nothing typed is lost
      setFormError(t('itinerary.save_failed', { error: err instanceof Error ? err.message : '' }));
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved();
    if (!addAnother) {
      onClose();
      return;
    }

    // Ready for the next stop of the day
    showSuccess(t('activityform.added', { name: finalName }));
    settledRef.current = '';
    setWhere('');
    setAddress('');
    setName('');
    autoNameRef.current = '';
    setLat(null);
    setLng(null);
    markerRef.current?.remove();
    markerRef.current = null;
    setTime(nextTime([], time || undefined));
    setTransportType('walk');
    setEstCost('');
    setCostCategory('other');
    categoryTouchedRef.current = false;
    setNotes('');
    whereInputRef.current?.focus();
  };

  const destinationName = (trip.destination || '').split(',')[0].trim();
  const statusLine = readingLink
    ? t('activityform.reading_link')
    : searching
      ? t('itinerary.searching')
      : noResults
        ? t('activityform.no_results')
        : null;

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="sheet-title">
            {editing ? t('itinerary.edit_activity') : t('activityform.title_add', { day: t('itinerary.day', { number: dayNumber }) })}
          </h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t('common.cancel')}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
        >
          {/* One box: search a place or paste a Google Maps link */}
          <div className="field">
            <label className="label" htmlFor="activity-where">{t('activityform.where')}</label>
            <div className={styles.searchWrap}>
              <Icon name="search" size={17} className={styles.searchIcon} />
              <input
                id="activity-where"
                ref={whereInputRef}
                type="text"
                className={`input ${styles.searchInput}`}
                placeholder={destinationName ? t('activityform.search_in', { place: destinationName }) : t('activityform.search_any')}
                value={where}
                autoComplete="off"
                enterKeyHint="search"
                onChange={(e) => {
                  setWhere(e.target.value);
                  setAddress('');
                  setLat(null);
                  setLng(null);
                }}
                onFocus={() => suggestions.length > 0 && where.trim().length >= 2 && lat == null && setShowSuggestions(true)}
                onKeyDown={(e) => {
                  // Enter picks the first suggestion instead of submitting
                  if (e.key === 'Enter' && showSuggestions && suggestions[0]) {
                    e.preventDefault();
                    pickSuggestion(suggestions[0]);
                  }
                }}
              />
              {where && (
                <button type="button" className={styles.clearBtn} onClick={clearPlace} aria-label={t('activityform.clear')}>
                  <Icon name="x" size={14} />
                </button>
              )}

              {showSuggestions && suggestions.length > 0 && (
                <div className={styles.suggestions} role="listbox">
                  {suggestions.map((s, idx) => (
                    <button
                      type="button"
                      key={`${s.lat},${s.lng},${idx}`}
                      role="option"
                      aria-selected={false}
                      className={styles.suggestionItem}
                      onClick={() => pickSuggestion(s)}
                    >
                      <span className={styles.suggestionIcon}>
                        <Icon name={s.category ? CATEGORY_ICONS[s.category] : 'pin'} size={15} />
                      </span>
                      <span className={styles.suggestionText}>
                        <strong>{s.name}</strong>
                        <span>{s.address}</span>
                      </span>
                      {s.category && <span className={styles.suggestionTag}>{t(`budget.categories.${s.category}`)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {statusLine ? (
              <span className={styles.placeStatus}>{statusLine}</span>
            ) : lat != null && lng != null ? (
              <span className={`${styles.placeStatus} ${styles.pinned}`}>
                <Icon name="check" size={13} strokeWidth={2.4} />
                <span className={styles.placeAddress}>{address || t('activityform.pinned')}</span>
                <a href={googlePlaceUrl({ location: where, lat, lng })} target="_blank" rel="noopener noreferrer" className={styles.checkLink}>
                  {t('activityform.check')}
                  <Icon name="arrowUpRight" size={11} />
                </a>
              </span>
            ) : (
              <span className={styles.placeStatus}>{t('activityform.paste_hint')}</span>
            )}
          </div>

          <div className={styles.nameTimeRow}>
            <div className="field">
              <label className="label" htmlFor="activity-name">{t('activityform.name')}</label>
              <input
                id="activity-name"
                type="text"
                className="input"
                placeholder={t('activityform.name_placeholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="activity-time">{t('itinerary.time')}</label>
              <input id="activity-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <span className="label">{t('activityform.getting_there')}</span>
            <div className={styles.chips} role="group" aria-label={t('activityform.getting_there')}>
              {TRANSPORTS.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={styles.chipBtn}
                  aria-pressed={transportType === mode}
                  onClick={() => setTransportType(mode)}
                >
                  <Icon name={TRANSPORT_ICONS[mode]} size={15} />
                  {t(`itinerary.transport_${mode}`)}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className={styles.moreToggle}
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((v) => !v)}
          >
            <Icon name="chevronDown" size={16} className={detailsOpen ? styles.chevronOpen : styles.chevron} />
            {detailsOpen ? t('activityform.less') : t('activityform.more')}
          </button>

          {detailsOpen && (
            <div className={styles.details}>
              <div className="field">
                <label className="label" htmlFor="activity-cost">{t('activityform.cost')}</label>
                <div className={styles.costWrap}>
                  <span className={styles.costSymbol}>{currencySymbol(currency, locale)}</span>
                  <input
                    id="activity-cost"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    className={`input ${styles.costInput}`}
                    placeholder="0"
                    value={estCost}
                    onChange={(e) => setEstCost(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <span className="label">{t('itinerary.category')}</span>
                <div className={styles.chips} role="group" aria-label={t('itinerary.category')}>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={styles.chipBtn}
                      aria-pressed={costCategory === cat}
                      onClick={() => {
                        categoryTouchedRef.current = true;
                        setCostCategory(cat);
                      }}
                    >
                      <Icon name={CATEGORY_ICONS[cat]} size={15} />
                      {t(`budget.categories.${cat}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span className="label">
                  {t('itinerary.pin_on_map')}
                  <span className={styles.mapHint}>{t('itinerary.tap_map')}</span>
                </span>
                <div ref={mapBoxRef} className={styles.selectMap} />
              </div>

              <div className="field">
                <label className="label" htmlFor="activity-notes">{t('itinerary.notes')}</label>
                <textarea
                  id="activity-notes"
                  className="input"
                  placeholder={t('itinerary.notes_placeholder')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {formError && <div className="form-error">{formError}</div>}

          <div className="btn-row">
            {editing ? (
              <button type="button" className="btn" onClick={onClose}>
                {t('common.cancel')}
              </button>
            ) : (
              <button type="button" className="btn" disabled={saving} onClick={() => save(true)}>
                {t('activityform.save_add_another')}
              </button>
            )}
            <button type="submit" disabled={saving || readingLink} className="btn btn-primary">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

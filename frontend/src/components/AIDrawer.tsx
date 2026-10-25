'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { apiRequest, showError } from '@/utils/api';
import { useAiEnabled } from '@/utils/useAiEnabled';
import { Icon, IconName } from './Icon';
import localStyles from './AIDrawer.module.css';

interface AIDrawerProps {
  trip: any;
  onRefresh: () => void;
  userRole?: string;
}

interface ForecastDay {
  dayNumber: number;
  date: string;
  code: number;
  max: number;
  min: number;
  rainChance: number | null;
}

type WeatherResult =
  | { status: 'ok'; place: string; forecast: ForecastDay[] }
  | { status: 'too-early'; place: string; availableFrom: string }
  | { status: 'past'; place: string }
  | { status: 'no-location'; destination: string };

// WMO weather codes used by Open-Meteo
function describeWeather(code: number): { label: string; icon: IconName; wet: boolean } {
  if (code === 0) return { label: 'Clear', icon: 'sun', wet: false };
  if (code <= 3) return { label: code === 1 ? 'Mostly clear' : code === 2 ? 'Partly cloudy' : 'Cloudy', icon: 'cloud', wet: false };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'cloud', wet: false };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'rain', wet: true };
  if (code >= 61 && code <= 67) return { label: 'Rain', icon: 'rain', wet: true };
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: 'snow', wet: true };
  if (code >= 80 && code <= 82) return { label: 'Showers', icon: 'rain', wet: true };
  if (code >= 85 && code <= 86) return { label: 'Snow showers', icon: 'snow', wet: true };
  if (code >= 95) return { label: 'Thunderstorm', icon: 'rain', wet: true };
  return { label: 'Mixed', icon: 'cloud', wet: false };
}

export const AIDrawer: React.FC<AIDrawerProps> = ({ trip, onRefresh, userRole = 'editor' }) => {
  const { t } = useTranslation();
  const aiEnabled = useAiEnabled();
  const canEdit = userRole === 'owner' || userRole === 'editor';

  // Weather
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [weatherError, setWeatherError] = useState('');

  // AI ideas (only when Gemini is set up)
  const [aiPrompt, setAiPrompt] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Emergency
  const [showEmgForm, setShowEmgForm] = useState(false);
  const [emgName, setEmgName] = useState('');
  const [emgRelation, setEmgRelation] = useState('');
  const [emgPhone, setEmgPhone] = useState('');
  const [emgNote, setEmgNote] = useState('');
  const [savingEmg, setSavingEmg] = useState(false);

  useEffect(() => {
    let active = true;
    setWeatherError('');
    apiRequest(`/weather?tripId=${encodeURIComponent(trip.id)}`)
      .then((res) => { if (active) setWeather(res); })
      .catch((err) => { if (active) setWeatherError(err.message || "Couldn't load the weather."); });
    return () => { active = false; };
  }, [trip.id, trip.days?.length]);

  const getAISuggestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt) return;

    setLoadingSuggestions(true);
    try {
      const res = await apiRequest('/ai/recommend', {
        method: 'POST',
        body: JSON.stringify({ destination: trip.destination, activityName: aiPrompt })
      });
      setSuggestions(res.map((s: any, idx: number) => ({ id: `sug-${idx}-${Date.now()}`, ...s })));
    } catch (err) {
      showError(err, "Couldn't get ideas right now.");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const addSuggestionToItinerary = async (sug: any) => {
    const firstDay = trip.days && trip.days[0];
    if (!firstDay) return;

    const order = trip.activities ? trip.activities.filter((a: any) => a.dayId === firstDay.id).length + 1 : 1;
    try {
      await apiRequest('/activities', {
        method: 'POST',
        body: JSON.stringify({
          dayId: firstDay.id,
          name: sug.name,
          time: '15:00',
          notes: sug.reason,
          location: sug.name,
          transportType: 'walk',
          estCost: 0,
          costCategory: 'other',
          order
        })
      });
      setSuggestions(prev => prev.filter(s => s.id !== sug.id));
      onRefresh();
    } catch (err) {
      showError(err, "Couldn't add it to the plan.");
    }
  };

  const handleAddEmergencySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emgName || !emgPhone || !emgRelation) return;

    setSavingEmg(true);
    try {
      await apiRequest('/emergency', {
        method: 'POST',
        body: JSON.stringify({ tripId: trip.id, name: emgName, relation: emgRelation, phone: emgPhone, note: emgNote })
      });
      setEmgName('');
      setEmgPhone('');
      setEmgRelation('');
      setEmgNote('');
      setShowEmgForm(false);
      onRefresh();
    } catch (err) {
      showError(err, "Couldn't save the contact.");
    } finally {
      setSavingEmg(false);
    }
  };

  const handleDeleteEmergency = async (id: string) => {
    if (!window.confirm('Remove this contact?')) return;
    try {
      await apiRequest(`/emergency/${id}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) {
      showError(err, "Couldn't remove the contact.");
    }
  };

  const formatDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  const wetDays = weather?.status === 'ok'
    ? weather.forecast.filter((d) => describeWeather(d.code).wet || (d.rainChance ?? 0) >= 60)
    : [];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('info.title')}</h1>
      </div>

      <div className="split">
      <div className="stack">
      {/* Weather */}
      <section className="section">
        <span className="eyebrow">
          Weather{weather && 'place' in weather ? ` · ${weather.place}` : ''}
        </span>
        <div className="card lift">
          {weatherError ? (
            <p style={{ fontSize: '14px' }}>{weatherError}</p>
          ) : !weather ? (
            <p style={{ fontSize: '14px' }}>Loading forecast…</p>
          ) : weather.status === 'too-early' ? (
            <div className={localStyles.alertOk}>
              <Icon name="calendar" size={16} />
              Forecasts reach 16 days ahead. Check back from {formatDay(weather.availableFrom)}.
            </div>
          ) : weather.status === 'past' ? (
            <p style={{ fontSize: '14px' }}>This trip has ended.</p>
          ) : weather.status === 'no-location' ? (
            <p style={{ fontSize: '14px' }}>
              Couldn&apos;t find &ldquo;{weather.destination}&rdquo; on the map. Pin an activity on the map to get the forecast.
            </p>
          ) : (
            <>
              <div className={wetDays.length > 0 ? localStyles.alertWarn : localStyles.alertOk}>
                <Icon name={wetDays.length > 0 ? 'rain' : 'sun'} size={16} />
                {wetDays.length > 0
                  ? `Rain likely on ${wetDays.map((d) => t('itinerary.day', { number: d.dayNumber })).join(', ')} — plan indoor options.`
                  : 'No rain expected on the forecast days.'}
              </div>
              <div className={localStyles.weatherGrid}>
                {weather.forecast.map((d) => {
                  const w = describeWeather(d.code);
                  return (
                    <div key={d.date} className={localStyles.weatherDay} title={w.label}>
                      <span className={localStyles.weatherLabel}>{t('itinerary.day', { number: d.dayNumber })}</span>
                      <span className={localStyles.weatherDate}>{formatDay(d.date)}</span>
                      <Icon name={w.icon} size={20} className={localStyles.weatherIcon} />
                      <span className={localStyles.weatherTemp}>{Math.round(d.max)}°</span>
                      <span className={localStyles.weatherLow}>{Math.round(d.min)}°</span>
                      {d.rainChance !== null && <span className={localStyles.weatherRain}>{d.rainChance}% rain</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      {/* AI ideas — only shown when Gemini is set up */}
      {aiEnabled && (
        <section className="section">
          <span className="eyebrow">Ask for ideas</span>
          <div className="card">
            <form onSubmit={getAISuggestions} className={localStyles.askRow}>
              <input
                type="text"
                className="input"
                placeholder="Parks, cafés, night markets…"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <button type="submit" disabled={loadingSuggestions} className="btn btn-primary">
                <Icon name="sparkles" size={15} />
                {loadingSuggestions ? t('common.loading') : 'Ask'}
              </button>
            </form>

            {suggestions.length > 0 && (
              <div className={localStyles.suggestionList}>
                {suggestions.map((sug) => (
                  <div key={sug.id} className={localStyles.suggestionCard}>
                    <div>
                      <h3 className={localStyles.sugTitle}>{sug.name}</h3>
                      <p className={localStyles.sugDesc}>{sug.reason}</p>
                    </div>
                    {canEdit && (
                      <div className={localStyles.voteRow}>
                        <span />
                        <button className="btn btn-sm" onClick={() => addSuggestionToItinerary(sug)}>
                          <Icon name="plus" size={14} />
                          Add to Day 1
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
      </div>

      <div className="stack">
      {/* Emergency */}
      <section className="section">
        <div className="section-head">
          <span className="eyebrow">{t('emergency.title')}</span>
          {canEdit && (
            <button className="btn btn-sm" onClick={() => setShowEmgForm(true)}>
              <Icon name="plus" size={14} />
              Contact
            </button>
          )}
        </div>

        <div className="list">
          {trip.emergency?.map((emg: any) => (
            <div key={emg.id} className="list-row">
              <div className={localStyles.emgDetails}>
                <span className="list-title">{emg.name}</span>
                <span className="list-sub">{emg.relation}</span>
                {emg.note && <span className={localStyles.emgNote}>{emg.note}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <a href={`tel:${emg.phone.replace(/[^\d+]/g, '')}`} className={localStyles.emgPhone}>{emg.phone}</a>
                {canEdit && (
                  <button className="btn-icon danger" onClick={() => handleDeleteEmergency(emg.id)} aria-label="Remove contact">
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {(!trip.emergency || trip.emergency.length === 0) && (
            <div className="list-row">
              <span className="list-sub">
                Add your hotel, your country&apos;s embassy and local emergency numbers so everyone has them.
              </span>
            </div>
          )}
        </div>
      </section>
      </div>
      </div>

      {/* Add Emergency Contact Sheet */}
      {showEmgForm && (
        <div className="sheet-overlay" onClick={() => setShowEmgForm(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2 className="sheet-title">{t('emergency.add_contact')}</h2>
              <button type="button" className="btn-icon" onClick={() => setShowEmgForm(false)} aria-label={t('common.cancel')}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <form onSubmit={handleAddEmergencySubmit} className="form">
              <div className="field">
                <label className="label">Name or service</label>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="e.g. Hotel front desk, Thai Embassy Tokyo"
                  value={emgName}
                  onChange={(e) => setEmgName(e.target.value)}
                />
              </div>

              <div className="field-row">
                <div className="field">
                  <label className="label">Relation</label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Lodging, embassy, police…"
                    value={emgRelation}
                    onChange={(e) => setEmgRelation(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="label">Phone</label>
                  <input
                    type="tel"
                    required
                    className="input"
                    placeholder="+81 3 3333 2222"
                    value={emgPhone}
                    onChange={(e) => setEmgPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label className="label">Address or medical notes</label>
                <textarea
                  className="input"
                  placeholder="Address, allergies, medications, blood type"
                  value={emgNote}
                  onChange={(e) => setEmgNote(e.target.value)}
                />
              </div>

              <div className="btn-row">
                <button type="button" className="btn" onClick={() => setShowEmgForm(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingEmg}>
                  {savingEmg ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

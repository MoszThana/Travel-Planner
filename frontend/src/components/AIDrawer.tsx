'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/utils/api';
import { Icon } from './Icon';
import localStyles from './AIDrawer.module.css';

interface AIDrawerProps {
  trip: any;
  onRefresh: () => void;
  userRole?: string;
}

export const AIDrawer: React.FC<AIDrawerProps> = ({ trip, onRefresh, userRole = 'editor' }) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Weather States
  const [weatherList, setWeatherList] = useState<any[]>([]);
  const [weatherAlerts, setWeatherAlerts] = useState<string[]>([]);
  
  // AI Suggestions and Voting States
  const [aiPrompt, setAiPrompt] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [votes, setVotes] = useState<Record<string, Record<string, number>>>({}); // { sugId: { up: number, down: number } }
  const [userVotes, setUserVotes] = useState<Record<string, number>>({}); // { sugId: 1 | -1 }

  // Share States
  const [shareType, setShareType] = useState('view'); // 'view' | 'edit'
  const [shareLink, setShareLink] = useState('');

  // Emergency States
  const [showEmgForm, setShowEmgForm] = useState(false);
  const [emgName, setEmgName] = useState('');
  const [emgRelation, setEmgRelation] = useState('');
  const [emgPhone, setEmgPhone] = useState('');
  const [emgNote, setEmgNote] = useState('');

  // Load weather and initial data
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await apiRequest('/weather?lat=35.676&lng=139.65'); // default Tokyo coords
        setWeatherList(res.list.slice(0, trip.days?.length || 3));
        
        // Scan for rain/storm alerts
        const rainDays: string[] = [];
        res.list.slice(0, trip.days?.length || 3).forEach((w: any, idx: number) => {
          if (w.weather[0].main.toLowerCase().includes('rain') || w.weather[0].main.toLowerCase().includes('storm')) {
            rainDays.push(`Day ${idx + 1} (${w.weather[0].description})`);
          }
        });
        setWeatherAlerts(rainDays);
      } catch (err) {
        console.warn('Weather API failed, showing simulation weather.');
        const mockW = [
          { main: { temp: 28 }, weather: [{ main: 'Clear', description: 'Sunny sky' }] },
          { main: { temp: 24 }, weather: [{ main: 'Rain', description: 'Light thunderstorm shower' }] },
          { main: { temp: 27 }, weather: [{ main: 'Clouds', description: 'Overcast' }] }
        ].slice(0, trip.days?.length || 3);
        setWeatherList(mockW);
        setWeatherAlerts([`Day 2 (light thunderstorm shower)`]);
      }
    };
    fetchWeather();
  }, [trip.days]);

  // Generate Share Links
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const base = window.location.origin;
      setShareLink(`${base}/trip/${trip.id}?invite=${shareType}`);
    }
  }, [trip.id, shareType]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    alert('Link copied to clipboard!');
  };

  // Get AI recommendations
  const getAISuggestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt) return;

    setLoadingSuggestions(true);
    try {
      const res = await apiRequest('/ai/recommend', {
        method: 'POST',
        body: JSON.stringify({
          destination: trip.destination,
          activityName: aiPrompt,
          weather: 'Clear'
        })
      });
      
      const formatted = res.map((s: any, idx: number) => ({
        id: `sug-ai-${idx}-${Date.now()}`,
        name: s.name,
        category: s.category || 'activity',
        reason: s.reason
      }));
      
      setSuggestions(formatted);

      // Initialize mock vote counts (some members already voted to test)
      const initialVotes: Record<string, Record<string, number>> = {};
      formatted.forEach((s: any) => {
        initialVotes[s.id] = {
          up: Math.floor(Math.random() * 3), // mock other user votes
          down: Math.floor(Math.random() * 2)
        };
      });
      setVotes(initialVotes);
    } catch {
      // Offline mock recommendation
      const mockRecs = [
        { id: `sug-mock-1-${Date.now()}`, name: `Golden Gai Pubs near ${aiPrompt}`, category: 'food', reason: 'Tucked away alleys with tiny, thematic bars.' },
        { id: `sug-mock-2-${Date.now()}`, name: `Shinjuku Gyoen National Garden`, category: 'landmark', reason: 'Large botanical garden, excellent photo spot.' }
      ];
      setSuggestions(mockRecs);
      
      const initialVotes: Record<string, Record<string, number>> = {};
      mockRecs.forEach((s: any) => {
        initialVotes[s.id] = { up: 2, down: 0 };
      });
      setVotes(initialVotes);
    }
    setLoadingSuggestions(false);
  };

  // Handle upvoting/downvoting
  const handleVote = async (sugId: string, type: 1 | -1) => {
    const currentVote = userVotes[sugId];
    
    // Send vote to server
    try {
      await apiRequest('/votes', {
        method: 'POST',
        body: JSON.stringify({
          tripId: trip.id,
          itemId: sugId,
          itemType: 'suggestion',
          userId: user?.id || 'guest',
          voteType: type
        })
      });
    } catch {
      console.warn('Vote registered offline.');
    }

    setUserVotes(prev => {
      const next = { ...prev };
      if (currentVote === type) {
        delete next[sugId];
      } else {
        next[sugId] = type;
      }
      return next;
    });

    setVotes(prev => {
      const next = { ...prev };
      const current = next[sugId] || { up: 0, down: 0 };
      
      if (currentVote === type) {
        // Toggle off
        if (type === 1) current.up = Math.max(0, current.up - 1);
        if (type === -1) current.down = Math.max(0, current.down - 1);
      } else {
        // Toggle on or switch
        if (type === 1) {
          current.up += 1;
          if (currentVote === -1) current.down = Math.max(0, current.down - 1);
        } else {
          current.down += 1;
          if (currentVote === 1) current.up = Math.max(0, current.up - 1);
        }
      }
      next[sugId] = current;
      return next;
    });
  };

  // Approve suggestion & add directly to Day 1 itinerary (owner only)
  const addSuggestionToItinerary = async (sug: any) => {
    const firstDay = trip.days && trip.days[0];
    if (!firstDay) return;

    const order = trip.activities ? trip.activities.filter((a: any) => a.dayId === firstDay.id).length + 1 : 1;
    const payload = {
      dayId: firstDay.id,
      name: sug.name,
      time: '15:00',
      notes: sug.reason,
      location: sug.name,
      transportType: 'walk',
      estCost: 0,
      costCategory: sug.category || 'other',
      order
    };

    try {
      await apiRequest('/activities', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch {
      const offlineTrips = JSON.parse(localStorage.getItem('offline_trips') || '[]');
      const offlineTrip = offlineTrips.find((t: any) => t.id === trip.id);
      if (offlineTrip) {
        offlineTrip.activities.push({
          id: `act-${Date.now()}`,
          ...payload,
          actCost: 0,
          visited: 0
        });
        localStorage.setItem('offline_trips', JSON.stringify(offlineTrips));
      }
    }
    alert(`"${sug.name}" added to Day 1 Itinerary!`);
    setSuggestions(prev => prev.filter(s => s.id !== sug.id));
    onRefresh();
  };

  const handleAddEmergencySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emgName || !emgPhone || !emgRelation) return;

    const payload = {
      tripId: trip.id,
      name: emgName,
      relation: emgRelation,
      phone: emgPhone,
      note: emgNote
    };

    try {
      await apiRequest('/emergency', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch {
      const offlineTrips = JSON.parse(localStorage.getItem('offline_trips') || '[]');
      const offlineTrip = offlineTrips.find((t: any) => t.id === trip.id);
      if (offlineTrip) {
        offlineTrip.emergency = offlineTrip.emergency || [];
        offlineTrip.emergency.push({
          id: `emg-${Date.now()}`,
          ...payload
        });
        localStorage.setItem('offline_trips', JSON.stringify(offlineTrips));
      }
    }

    setEmgName('');
    setEmgPhone('');
    setEmgRelation('');
    setEmgNote('');
    setShowEmgForm(false);
    onRefresh();
  };

  const isOwner = user?.id === trip.ownerId;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('ai.title')}</h1>
      </div>

      <div className="split">
      <div className="stack">
      {/* Weather */}
      {weatherList.length > 0 && (
        <section className="section">
          <span className="eyebrow">Weather</span>
          <div className="card">
            <div className={weatherAlerts.length > 0 ? localStyles.alertWarn : localStyles.alertOk}>
              <Icon name={weatherAlerts.length > 0 ? 'rain' : 'sun'} size={16} />
              {weatherAlerts.length > 0
                ? `Rain or storms expected on ${weatherAlerts.join(', ')}. Outdoor plans may be affected.`
                : 'Clear skies ahead — a good stretch for outdoor plans.'}
            </div>
            <div className={localStyles.weatherGrid} style={{ gridTemplateColumns: `repeat(${weatherList.length}, 1fr)` }}>
              {weatherList.map((w, idx) => {
                const main = w.weather[0].main;
                const icon = main === 'Rain' || main === 'Thunderstorm' || main === 'Drizzle' ? 'rain' : main === 'Clear' ? 'sun' : 'cloud';
                return (
                  <div key={idx} className={localStyles.weatherDay}>
                    <span className={localStyles.weatherLabel}>{t('itinerary.day', { number: idx + 1 })}</span>
                    <Icon name={icon} size={20} className={localStyles.weatherIcon} />
                    <span className={localStyles.weatherTemp}>{Math.round(w.main.temp)}°</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* AI recommendations & voting */}
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
            <>
              <span className={localStyles.voteHint}>Vote together — tap to like or pass</span>
              <div className={localStyles.suggestionList}>
                {suggestions.map((sug) => {
                  const uVote = userVotes[sug.id];
                  const tally = votes[sug.id] || { up: 0, down: 0 };

                  return (
                    <div key={sug.id} className={localStyles.suggestionCard}>
                      <div>
                        <h3 className={localStyles.sugTitle}>{sug.name}</h3>
                        <p className={localStyles.sugDesc}>{sug.reason}</p>
                      </div>
                      <div className={localStyles.voteRow}>
                        <div className={localStyles.voteButtons}>
                          <button
                            className={`${localStyles.voteBtn} ${uVote === 1 ? localStyles.voteBtnActiveUp : ''}`}
                            onClick={() => handleVote(sug.id, 1)}
                            aria-label="Like"
                          >
                            <Icon name="thumbsUp" size={14} />
                            {tally.up}
                          </button>
                          <button
                            className={`${localStyles.voteBtn} ${uVote === -1 ? localStyles.voteBtnActiveDown : ''}`}
                            onClick={() => handleVote(sug.id, -1)}
                            aria-label="Dislike"
                          >
                            <Icon name="thumbsDown" size={14} />
                            {tally.down}
                          </button>
                        </div>
                        {isOwner && (
                          <button className="btn btn-sm" onClick={() => addSuggestionToItinerary(sug)}>
                            <Icon name="plus" size={14} />
                            Add to Day 1
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      </div>

      <div className="stack">
      {/* Share */}
      <section className="section">
        <span className="eyebrow">Share trip</span>
        <div className="card">
          <select
            className="input input-sm"
            value={shareType}
            onChange={(e) => setShareType(e.target.value)}
          >
            <option value="view">View-only link</option>
            <option value="edit">Collaborator invite (can edit)</option>
          </select>
          <div className={localStyles.shareUrlBox}>
            <Icon name="link" size={15} className={localStyles.shareIcon} />
            <span className={localStyles.shareUrlText}>{shareLink}</span>
            <button className="btn btn-sm" onClick={handleCopyLink}>
              Copy
            </button>
          </div>
        </div>
      </section>

      {/* Emergency */}
      <section className="section">
        <div className="section-head">
          <span className="eyebrow">{t('emergency.title')}</span>
          <button className="btn btn-sm" onClick={() => setShowEmgForm(true)}>
            <Icon name="plus" size={14} />
            Contact
          </button>
        </div>

        <div className="list">
          <div className="list-row">
            <div className={localStyles.emgDetails}>
              <span className="list-title">Police</span>
              <span className="list-sub">Local emergency</span>
            </div>
            <span className={localStyles.emgPhone}>191 / 110</span>
          </div>
          <div className="list-row">
            <div className={localStyles.emgDetails}>
              <span className="list-title">Ambulance</span>
              <span className="list-sub">Medical help</span>
            </div>
            <span className={localStyles.emgPhone}>1669 / 119</span>
          </div>

          {trip.emergency?.map((emg: any) => (
            <div key={emg.id} className="list-row">
              <div className={localStyles.emgDetails}>
                <span className="list-title">{emg.name}</span>
                <span className="list-sub">{emg.relation}</span>
                {emg.note && <span className={localStyles.emgNote}>{emg.note}</span>}
              </div>
              <span className={localStyles.emgPhone}>{emg.phone}</span>
            </div>
          ))}
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
                  placeholder="e.g. Sunroute Hotel front desk"
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
                    placeholder="Lodging, family…"
                    value={emgRelation}
                    onChange={(e) => setEmgRelation(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="label">Phone</label>
                  <input
                    type="text"
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
                <button type="submit" className="btn btn-primary">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

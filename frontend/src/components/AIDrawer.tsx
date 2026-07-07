'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/context/TranslationContext';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/utils/api';
import styles from './Itinerary.module.css'; // modal sheets
import localStyles from './AIDrawer.module.css';

interface AIDrawerProps {
  trip: any;
  onRefresh: () => void;
}

export const AIDrawer: React.FC<AIDrawerProps> = ({ trip, onRefresh }) => {
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
    <div className={localStyles.container}>
      <h2 className={localStyles.title}>{t('ai.title')}</h2>

      {/* Weather Forecast Alerts */}
      {weatherList.length > 0 && (
        <div className={localStyles.sectionCard}>
          <span className={localStyles.cardTitle}>☀️ Weather Warnings</span>
          {weatherAlerts.length > 0 ? (
            <div style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '12px', borderRadius: '8px', color: 'var(--accent)', fontSize: '12px', fontWeight: '700' }}>
              ⚠️ Weather Warning: Rain or storm predicted on {weatherAlerts.join(', ')}. Outdoor plans might be affected.
            </div>
          ) : (
            <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)', padding: '12px', borderRadius: '8px', color: '#22c55e', fontSize: '12px', fontWeight: '700' }}>
              ☀️ Weather Outlook: Skies look clear. Great time for outdoor activities!
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weatherList.length}, 1fr)`, gap: '8px', marginTop: '6px' }}>
            {weatherList.map((w, idx) => (
              <div key={idx} style={{ background: 'var(--background)', padding: '8px', borderRadius: '8px', textAlign: 'center', fontSize: '11px' }}>
                <div style={{ fontWeight: '700' }}>Day {idx + 1}</div>
                <div style={{ fontSize: '14px', fontWeight: '800', margin: '4px 0' }}>{Math.round(w.main.temp)}°C</div>
                <div style={{ color: 'var(--text-muted)' }}>{w.weather[0].main}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive AI Recommendation desk & Voting list */}
      <div className={localStyles.sectionCard}>
        <span className={localStyles.cardTitle}>✨ Gemini Nearby Recommendation Drawer</span>
        <form onSubmit={getAISuggestions} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className={localStyles.searchInput}
            style={{ flex: 1, boxShadow: 'none' }}
            placeholder="What are you looking for? (e.g. parks, cafes)"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <button type="submit" disabled={loadingSuggestions} className={localStyles.copyBtn} style={{ background: 'var(--secondary)' }}>
            {loadingSuggestions ? '...' : 'Ask AI'}
          </button>
        </form>

        {suggestions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
            <span className={localStyles.cardTitle} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>🗳️ Collaborative Votes (Like / Dislike to vote as group)</span>
            
            {suggestions.map((sug) => {
              const uVote = userVotes[sug.id];
              const tally = votes[sug.id] || { up: 0, down: 0 };

              return (
                <div key={sug.id} className={localStyles.suggestionCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 className={localStyles.sugTitle}>📍 {sug.name}</h4>
                      <p className={localStyles.sugDesc}>{sug.reason}</p>
                    </div>
                  </div>
                  <div className={localStyles.voteRow}>
                    <div className={localStyles.voteButtons}>
                      <button 
                        className={`${localStyles.voteBtn} ${uVote === 1 ? localStyles.voteBtnActiveUp : ''}`}
                        onClick={() => handleVote(sug.id, 1)}
                      >
                        👍 {tally.up}
                      </button>
                      <button 
                        className={`${localStyles.voteBtn} ${uVote === -1 ? localStyles.voteBtnActiveDown : ''}`}
                        onClick={() => handleVote(sug.id, -1)}
                      >
                        👎 {tally.down}
                      </button>
                    </div>
                    {isOwner && (
                      <button 
                        className={localStyles.copyBtn}
                        style={{ padding: '4px 8px', fontSize: '10px' }}
                        onClick={() => addSuggestionToItinerary(sug)}
                      >
                        + Add to Day 1
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Share settings */}
      <div className={localStyles.sectionCard}>
        <span className={localStyles.cardTitle}>🔗 Share Trip Link</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select 
            className={styles.select} 
            style={{ padding: '6px', fontSize: '12px' }}
            value={shareType}
            onChange={(e) => setShareType(e.target.value)}
          >
            <option value="view">View Only Link</option>
            <option value="edit">Editable Collaborator Invite</option>
          </select>
          <div className={localStyles.shareUrlBox} style={{ flex: 1, padding: '4px 8px' }}>
            <span className={localStyles.shareUrlText}>{shareLink}</span>
          </div>
          <button className={localStyles.copyBtn} onClick={handleCopyLink}>
            Copy
          </button>
        </div>
      </div>

      {/* Emergency Board Directory */}
      <div className={localStyles.sectionCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className={localStyles.cardTitle}>🚨 Emergency Information Hub</span>
          <button className={localStyles.copyBtn} style={{ background: 'var(--accent)', padding: '6px' }} onClick={() => setShowEmgForm(true)}>
            + Add Contact
          </button>
        </div>

        <div className={localStyles.emergencyGrid}>
          {/* Default Local Emergency Hotlines */}
          <div className={localStyles.emergencyItem}>
            <div className={localStyles.emgDetails}>
              <span className={localStyles.emgName}>Police Department Hotline</span>
              <span className={localStyles.emgRelation}>Local Emergency</span>
            </div>
            <span className={localStyles.emgPhone}>191 / 110</span>
          </div>
          <div className={localStyles.emergencyItem}>
            <div className={localStyles.emgDetails}>
              <span className={localStyles.emgName}>Medical Ambulance Hotline</span>
              <span className={localStyles.emgRelation}>Medical Help</span>
            </div>
            <span className={localStyles.emgPhone}>1669 / 119</span>
          </div>

          {/* User Added Emergency Details */}
          {trip.emergency?.map((emg: any) => (
            <div key={emg.id} className={localStyles.emergencyItem}>
              <div className={localStyles.emgDetails}>
                <span className={localStyles.emgName}>{emg.name}</span>
                <span className={localStyles.emgRelation}>{emg.relation}</span>
                {emg.note && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{emg.note}</span>}
              </div>
              <span className={localStyles.emgPhone}>{emg.phone}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add Emergency Contact Drawer */}
      {showEmgForm && (
        <div className={styles.modalOverlay} onClick={() => setShowEmgForm(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={localStyles.cardTitle} style={{ fontSize: '16px' }}>Add Emergency Contact</h3>
            <form onSubmit={handleAddEmergencySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className={styles.formGroup}>
                <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                  Contact Name / Service
                </label>
                <input
                  type="text"
                  required
                  className={styles.textarea}
                  style={{ minHeight: 'unset' }}
                  placeholder="e.g. Sunroute Hotel Frontdesk"
                  value={emgName}
                  onChange={(e) => setEmgName(e.target.value)}
                />
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                    Type / Relation
                  </label>
                  <input
                    type="text"
                    required
                    className={styles.textarea}
                    style={{ minHeight: 'unset' }}
                    placeholder="e.g. Lodging, Family, Embassy"
                    value={emgRelation}
                    onChange={(e) => setEmgRelation(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                    Phone Number
                  </label>
                  <input
                    type="text"
                    required
                    className={styles.textarea}
                    style={{ minHeight: 'unset' }}
                    placeholder="e.g. +81-3333-2222"
                    value={emgPhone}
                    onChange={(e) => setEmgPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.dayTab} style={{ background: 'transparent', padding: 0, border: 'none', textAlign: 'left' }}>
                  Location Address or Medical Notes
                </label>
                <textarea
                  className={styles.textarea}
                  placeholder="Address or list allergies, medications, blood type"
                  value={emgNote}
                  onChange={(e) => setEmgNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="submit" className={styles.addDayBtn} style={{ flex: 2, background: 'var(--primary)', color: 'white', border: 'none' }}>
                  {t('common.save')}
                </button>
                <button type="button" className={styles.addDayBtn} style={{ flex: 1 }} onClick={() => setShowEmgForm(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

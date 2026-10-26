'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { BottomNav, TabType } from '@/components/BottomNav';
import { Dashboard } from '@/components/Dashboard';
import { Itinerary } from '@/components/Itinerary';
import { MapPlanner } from '@/components/MapPlanner';
import { BudgetTracker } from '@/components/BudgetTracker';
import { ExpenseSplit } from '@/components/ExpenseSplit';
import { AIDrawer } from '@/components/AIDrawer';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/context/TranslationContext';
import { LoginView } from '@/components/LoginView';
import { WhatsNew, TripEvent } from '@/components/WhatsNew';
import { apiRequest, showError } from '@/utils/api';

const INVITE_KEY = 'pending_invite';

export default function Home() {
  const { user, authLoading } = useAuth();
  const { t } = useTranslation();
  const [trips, setTrips] = useState<any[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [activeTripDetails, setActiveTripDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tripsError, setTripsError] = useState(false);
  const [tripLoadError, setTripLoadError] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  // An invite link (?invite=TOKEN) is remembered until the visitor has logged in
  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('invite');
    if (fromUrl) {
      sessionStorage.setItem(INVITE_KEY, fromUrl);
      url.searchParams.delete('invite');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    setInviteToken(fromUrl || sessionStorage.getItem(INVITE_KEY));
  }, []);

  // Fetch all trips list. `silent` = background refresh: keep what's on screen if it fails
  const loadTrips = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setTripsError(false);
    try {
      const data = await apiRequest('/trips') as any[];
      setTrips(data);
    } catch {
      if (!silent) setTripsError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch specific trip full details (days, activities, budgets, splits, events)
  const loadTripDetails = useCallback(async (tripId: string, silent = false) => {
    if (!silent) setTripLoadError(false);
    try {
      const data = await apiRequest(`/trips/${tripId}`) as any;
      setActiveTripDetails(data);
    } catch {
      if (!silent) {
        setActiveTripDetails(null);
        setTripLoadError(true);
      }
    }
  }, []);

  // Live updates: refresh quietly every 30 s while the page is visible, and right away
  // when the person comes back to the tab — so everyone sees each other's changes
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (activeTripId) loadTripDetails(activeTripId, true);
      else loadTrips(true);
    };
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [user, activeTripId, loadTrips, loadTripDetails]);

  // "What's new": when this person last looked at each trip's changes (per device)
  const seenKey = (tripId: string) => `events_seen_${tripId}`;
  const [seenAt, setSeenAt] = useState(0);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  useEffect(() => {
    if (!activeTripId) return;
    let stored = 0;
    try {
      stored = Number(localStorage.getItem(seenKey(activeTripId)) || 0);
      if (!stored) {
        // First visit on this device: start counting from now instead of showing old history as new
        stored = Date.now();
        localStorage.setItem(seenKey(activeTripId), String(stored));
      }
    } catch {
      stored = Date.now();
    }
    setSeenAt(stored);
  }, [activeTripId]);

  const tripEvents: TripEvent[] = activeTripDetails?.events || [];
  const unreadCount = tripEvents.filter((e) => e.createdAt > seenAt && e.userId !== user?.id).length;

  const openWhatsNew = () => {
    setShowWhatsNew(true);
  };
  const closeWhatsNew = () => {
    setShowWhatsNew(false);
    const now = Date.now();
    setSeenAt(now);
    try {
      if (activeTripId) localStorage.setItem(seenKey(activeTripId), String(now));
    } catch {
      // Storage unavailable: unread state resets on reload
    }
  };

  // Load trips list on mount
  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  // Once logged in, accept a pending invite and open that trip
  useEffect(() => {
    if (!user || !inviteToken) return;
    (async () => {
      try {
        const res = await apiRequest(`/invites/${encodeURIComponent(inviteToken)}`, { method: 'POST' });
        await loadTrips();
        setActiveTripId(res.tripId);
        setActiveTab('home');
      } catch (err) {
        showError(err, t('page.join_failed'));
      } finally {
        sessionStorage.removeItem(INVITE_KEY);
        setInviteToken(null);
      }
    })();
    // t() is recreated each render; adding it would re-run the invite acceptance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, inviteToken, loadTrips]);

  // Load trip details when trip selection changes
  useEffect(() => {
    if (activeTripId) {
      loadTripDetails(activeTripId);
    } else {
      setActiveTripDetails(null);
    }
  }, [activeTripId, loadTripDetails]);

  // Refresh active trip data
  const handleRefresh = () => {
    loadTrips();
    if (activeTripId) {
      loadTripDetails(activeTripId);
    }
  };

  const handleTripSelect = (id: string) => {
    setActiveTripId(id);
    setActiveTab('home');
  };

  const handleBackToDashboard = () => {
    setActiveTripId(null);
    setActiveTripDetails(null);
  };

  // Render correct active tab viewport
  const renderTabContent = () => {
    if (tripLoadError) {
      return (
        <div className="empty">
          {t('page.trip_load_failed')}
          <div className="btn-row">
            <button className="btn btn-sm" onClick={handleBackToDashboard}>{t('common.back')}</button>
            <button className="btn btn-sm btn-primary" onClick={() => activeTripId && loadTripDetails(activeTripId)}>
              {t('common.retry')}
            </button>
          </div>
        </div>
      );
    }
    if (!activeTripDetails) {
      return <div className="empty">{t('common.loading_short')}</div>;
    }

    const activeUserMember = activeTripDetails?.members?.find((m: any) => m.id === user?.id);
    const userRole = activeUserMember?.role || 'viewer';

    switch (activeTab) {
      case 'home':
        return (
          <Itinerary
            trip={activeTripDetails}
            onBack={handleBackToDashboard}
            onRefresh={handleRefresh}
            userRole={userRole}
          />
        );
      case 'map':
        return (
          <MapPlanner
            trip={activeTripDetails}
            onRefresh={handleRefresh}
            userRole={userRole}
          />
        );
      case 'budget':
        return (
          <BudgetTracker
            trip={activeTripDetails}
            onRefresh={handleRefresh}
            userRole={userRole}
          />
        );
      case 'group':
        return (
          <ExpenseSplit
            trip={activeTripDetails}
            onRefresh={handleRefresh}
            userRole={userRole}
          />
        );
      case 'ai':
        return (
          <AIDrawer
            trip={activeTripDetails}
            onRefresh={handleRefresh}
            userRole={userRole}
          />
        );
      default:
        return null;
    }
  };

  if (authLoading) {
    return <div className="empty">{t('common.loading_short')}</div>;
  }

  if (!user) {
    return <LoginView inviteToken={inviteToken} />;
  }

  return (
    <>
      <Header
        activeTab={activeTripId ? activeTab : undefined}
        onTabChange={setActiveTab}
        onHome={handleBackToDashboard}
        whatsNew={activeTripId && activeTripDetails ? { unread: unreadCount, onOpen: openWhatsNew } : undefined}
      />

      {showWhatsNew && activeTripDetails && (
        <WhatsNew events={tripEvents} seenAt={seenAt} currentUserId={user.id} onClose={closeWhatsNew} />
      )}

      {loading ? (
        <div className="empty">
          {t('common.loading_short')}
        </div>
      ) : activeTripId ? (
        // Trip Planning active view mode
        <>
          <main style={{ flex: 1 }}>{renderTabContent()}</main>
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        </>
      ) : tripsError ? (
        <div className="empty">
          {t('page.trips_load_failed')}
          <button className="btn btn-sm btn-primary" onClick={() => loadTrips()}>{t('common.retry')}</button>
        </div>
      ) : (
        // Trips list selection Dashboard mode
        <main style={{ flex: 1 }}>
          <Dashboard
            trips={trips}
            onTripSelect={handleTripSelect}
            onRefresh={handleRefresh}
          />
        </main>
      )}
    </>
  );
}

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
import { LoginView } from '@/components/LoginView';
import { apiRequest, showError } from '@/utils/api';

const INVITE_KEY = 'pending_invite';

export default function Home() {
  const { user, authLoading } = useAuth();
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

  // Fetch all trips list
  const loadTrips = useCallback(async () => {
    if (!user) return;
    setTripsError(false);
    try {
      const data = await apiRequest('/trips') as any[];
      setTrips(data);
    } catch {
      setTripsError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch specific trip full details (days, activities, budgets, splits)
  const loadTripDetails = useCallback(async (tripId: string) => {
    setTripLoadError(false);
    try {
      const data = await apiRequest(`/trips/${tripId}`) as any;
      setActiveTripDetails(data);
    } catch {
      setActiveTripDetails(null);
      setTripLoadError(true);
    }
  }, []);

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
        showError(err, "Couldn't join the trip from this invite link.");
      } finally {
        sessionStorage.removeItem(INVITE_KEY);
        setInviteToken(null);
      }
    })();
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
          Couldn&apos;t load this trip. Check your connection and try again.
          <div className="btn-row">
            <button className="btn btn-sm" onClick={handleBackToDashboard}>Back</button>
            <button className="btn btn-sm btn-primary" onClick={() => activeTripId && loadTripDetails(activeTripId)}>
              Retry
            </button>
          </div>
        </div>
      );
    }
    if (!activeTripDetails) {
      return <div className="empty">Loading trip…</div>;
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
    return <div className="empty">Loading…</div>;
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
      />

      {loading ? (
        <div className="empty">
          Loading…
        </div>
      ) : activeTripId ? (
        // Trip Planning active view mode
        <>
          <main style={{ flex: 1 }}>{renderTabContent()}</main>
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        </>
      ) : tripsError ? (
        <div className="empty">
          Couldn&apos;t load your trips. Check your connection and try again.
          <button className="btn btn-sm btn-primary" onClick={loadTrips}>Retry</button>
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

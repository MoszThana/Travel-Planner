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
import { apiRequest, getOfflineTrips, saveOfflineTrips } from '@/utils/api';

export default function Home() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<any[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [activeTripDetails, setActiveTripDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch all trips list
  const loadTrips = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiRequest(`/trips?userId=${user.id}`) as any[];
      setTrips(data);
      // Sync offline cache
      saveOfflineTrips(data);
    } catch {
      console.warn('Backend server offline. Loading LocalStorage cached trips.');
      setTrips(getOfflineTrips());
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch specific trip full details (days, activities, budgets, splits)
  const loadTripDetails = useCallback(async (tripId: string) => {
    try {
      const data = await apiRequest(`/trips/${tripId}`) as any;
      setActiveTripDetails(data);
    } catch {
      console.warn(`Fetching details for trip ${tripId} failed, loading LocalStorage backup.`);
      const offlineList = getOfflineTrips();
      const found = offlineList.find((t: any) => t.id === tripId);
      if (found) {
        setActiveTripDetails(found);
      }
    }
  }, []);

  // Load trips list on mount
  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

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
    if (!activeTripDetails) {
      return <div style={{ padding: 32, textAlign: 'center' }}>Loading Trip Details...</div>;
    }

    const activeUserMember = activeTripDetails?.members?.find((m: any) => m.id === user?.id);
    const userRole = activeUserMember?.role || (activeTripDetails?.ownerId === user?.id ? 'owner' : 'viewer');

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

  if (!user) {
    return <LoginView />;
  }

  return (
    <>
      <Header />
      
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading Travel Planner...
        </div>
      ) : activeTripId ? (
        // Trip Planning active view mode
        <>
          <main style={{ flex: 1 }}>{renderTabContent()}</main>
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        </>
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

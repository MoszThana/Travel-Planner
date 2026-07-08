const BACKEND_URL = '/api';

// Simple API helper with LocalStorage fallback to guarantee working code even if backend is offline
export async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  try {
    const res = await fetch(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      throw new Error(err.error || `HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.warn(`API Request to ${endpoint} failed, checking fallback:`, err);
    throw err;
  }
}

// -------------------------------------------------------------------------
// LOCAL STORAGE BACKUP DATABASE (For client-only/offline fallback)
// -------------------------------------------------------------------------
const LS_KEYS = {
  TRIPS: 'offline_trips',
  ACTIVE_TRIP_ID: 'offline_active_trip_id',
};

// Seed mock trips if localStorage is empty
function ensureSeedTrips() {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(LS_KEYS.TRIPS);
  if (!stored) {
    const seed = [
      {
        id: 'trip-japan',
        name: 'Tokyo & Kyoto Exploration',
        destination: 'Tokyo, Japan',
        startDate: Date.now() + 86400000, // tomorrow
        endDate: Date.now() + 86400000 * 5, // 5 days
        ownerId: 'user-maru',
        createdAt: Date.now(),
        days: [
          { id: 'day-1', tripId: 'trip-japan', dayNumber: 1, date: Date.now() + 86400000 },
          { id: 'day-2', tripId: 'trip-japan', dayNumber: 2, date: Date.now() + 86400000 * 2 },
          { id: 'day-3', tripId: 'trip-japan', dayNumber: 3, date: Date.now() + 86400000 * 3 },
          { id: 'day-4', tripId: 'trip-japan', dayNumber: 4, date: Date.now() + 86400000 * 4 },
          { id: 'day-5', tripId: 'trip-japan', dayNumber: 5, date: Date.now() + 86400000 * 5 }
        ],
        activities: [
          { id: 'act-1', dayId: 'day-1', name: 'Arrive at Narita & Train to Hotel', time: '10:30', notes: 'Buy Suica card at airport station.', location: 'Narita Airport Terminal 1', lat: 35.772, lng: 140.392, transportType: 'train', estCost: 3200, actCost: 3200, costCategory: 'transport', order: 1, visited: 1 },
          { id: 'act-2', dayId: 'day-1', name: 'Sushi Dinner in Ginza', time: '18:00', notes: 'Reservation at 6 PM. Dress code: smart casual.', location: 'Ginza Kyubey', lat: 35.669, lng: 139.761, transportType: 'walk', estCost: 15000, actCost: 16500, costCategory: 'food', order: 2, visited: 0 },
          { id: 'act-3', dayId: 'day-2', name: 'Shibuya Crossing & Hachiko Statue', time: '09:30', notes: 'Best photo spot is Starbucks 2nd floor.', location: 'Shibuya Crossing', lat: 35.659, lng: 139.700, transportType: 'train', estCost: 200, actCost: 200, costCategory: 'transport', order: 1, visited: 0 },
          { id: 'act-4', dayId: 'day-2', name: 'Meiji Shrine Walk', time: '14:00', notes: 'Quiet wooded walk in middle of city.', location: 'Meiji Jingu', lat: 35.676, lng: 139.699, transportType: 'walk', estCost: 0, actCost: 0, costCategory: 'activity', order: 2, visited: 0 }
        ],
        members: [
          { id: 'user-maru', name: 'Maru', email: 'maru@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Maru', role: 'owner' },
          { id: 'user-somchai', name: 'Somchai', email: 'somchai@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Somchai', role: 'editor' },
          { id: 'user-jane', name: 'Jane', email: 'jane@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Jane', role: 'editor' },
          { id: 'user-david', name: 'David', email: 'david@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=David', role: 'viewer' }
        ],
        expenses: [
          { id: 'exp-1', tripId: 'trip-japan', payerId: 'user-maru', amount: 16500, description: 'Sushi dinner Ginza', category: 'food', splitType: 'equal', createdAt: Date.now() - 3600000 }
        ],
        splits: [
          { id: 'split-1', expenseId: 'exp-1', userId: 'user-maru', amount: 4125 },
          { id: 'split-2', expenseId: 'exp-1', userId: 'user-somchai', amount: 4125 },
          { id: 'split-3', expenseId: 'exp-1', userId: 'user-jane', amount: 4125 },
          { id: 'split-4', expenseId: 'exp-1', userId: 'user-david', amount: 4125 }
        ],
        emergency: [
          { id: 'emg-1', tripId: 'trip-japan', name: 'Hotel Sunroute Plaza Shinjuku', relation: 'Lodging', phone: '+81 3-3375-3211', note: '2-3-1 Yoyogi, Shibuya-ku, Tokyo' },
          { id: 'emg-2', tripId: 'trip-japan', name: 'Tourist Police Hotline', relation: 'Local Help', phone: '110', note: 'English speakers available' }
        ],
        votes: []
      }
    ];
    localStorage.setItem(LS_KEYS.TRIPS, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(stored);
}

export function getOfflineTrips() {
  return ensureSeedTrips();
}

export function saveOfflineTrips(trips: any[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LS_KEYS.TRIPS, JSON.stringify(trips));
  }
}

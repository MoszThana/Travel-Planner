import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { db, schema } from './db/index.js';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// Initialize Gemini Client if API key is provided
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log('Gemini AI Client initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize Gemini AI client:', err);
  }
} else {
  console.log('No GEMINI_API_KEY found. Running in simulated AI mode.');
}

// Helper to generate UUIDs locally without extra packages
function generateUUID() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// -------------------------------------------------------------------------
// 1. SYSTEM HEALTH & SEED DATA
// -------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Seed mock users if empty
async function ensureSeedUsers() {
  const existingUsers = await db.select().from(schema.users).limit(1);
  if (existingUsers.length === 0) {
    const defaultUsers = [
      { id: 'user-maru', name: 'Maru', email: 'maru@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Maru', createdAt: Date.now() },
      { id: 'user-somchai', name: 'Somchai', email: 'somchai@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Somchai', createdAt: Date.now() },
      { id: 'user-jane', name: 'Jane', email: 'jane@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Jane', createdAt: Date.now() },
      { id: 'user-david', name: 'David', email: 'david@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=David', createdAt: Date.now() }
    ];
    for (const u of defaultUsers) {
      await db.insert(schema.users).values(u);
    }
    console.log('Database seeded with test user profiles.');
  }
}
ensureSeedUsers().catch(console.error);

// -------------------------------------------------------------------------
// 2. TRIP OPERATIONS
// -------------------------------------------------------------------------

// List all trips
app.get('/api/trips', async (req, res) => {
  try {
    const list = await db.select().from(schema.trips).orderBy(schema.trips.createdAt);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific trip in full (with days, activities, members, expenses, emergency contacts, votes)
app.get('/api/trips/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const tripRows = await db.select().from(schema.trips).where(eq(schema.trips.id, id));
    if (tripRows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const trip = tripRows[0];

    // Fetch Days
    const tripDays = await db.select().from(schema.days).where(eq(schema.days.tripId, id)).orderBy(schema.days.dayNumber);

    // Fetch Activities for all days
    const dayIds = tripDays.map(d => d.id);
    let tripActivities: any[] = [];
    if (dayIds.length > 0) {
      tripActivities = await db.select().from(schema.activities)
        .where(inArray(schema.activities.dayId, dayIds))
        .orderBy(schema.activities.order);
    }

    // Fetch Members
    const members = await db.select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      avatarUrl: schema.users.avatarUrl,
      role: schema.tripMembers.role
    })
      .from(schema.tripMembers)
      .innerJoin(schema.users, eq(schema.tripMembers.userId, schema.users.id))
      .where(eq(schema.tripMembers.tripId, id));

    // Fetch Group Expenses & Splits
    const expenses = await db.select().from(schema.groupExpenses).where(eq(schema.groupExpenses.tripId, id));
    const expenseIds = expenses.map(e => e.id);
    let splits: any[] = [];
    if (expenseIds.length > 0) {
      splits = await db.select().from(schema.expenseSplits).where(inArray(schema.expenseSplits.expenseId, expenseIds));
    }

    // Fetch Emergency Contacts
    const emergency = await db.select().from(schema.emergencyContacts).where(eq(schema.emergencyContacts.tripId, id));

    // Fetch Votes
    const votes = await db.select().from(schema.votes).where(eq(schema.votes.tripId, id));

    res.json({
      ...trip,
      days: tripDays,
      activities: tripActivities,
      members,
      expenses,
      splits,
      emergency,
      votes
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new trip
app.post('/api/trips', async (req, res) => {
  const { name, destination, startDate, endDate, ownerId } = req.body;
  if (!name || !destination || !startDate || !endDate || !ownerId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const tripId = generateUUID();
  try {
    // 1. Insert Trip
    await db.insert(schema.trips).values({
      id: tripId,
      name,
      destination,
      startDate,
      endDate,
      ownerId,
      createdAt: Date.now()
    });

    // 2. Add owner as the first member
    await db.insert(schema.tripMembers).values({
      id: generateUUID(),
      tripId,
      userId: ownerId,
      role: 'owner',
      joinedAt: Date.now()
    });

    // Seed remaining mock users as members for the prototype
    const otherUsers = ['user-somchai', 'user-jane', 'user-david'].filter(uid => uid !== ownerId);
    for (const uid of otherUsers) {
      await db.insert(schema.tripMembers).values({
        id: generateUUID(),
        tripId,
        userId: uid,
        role: 'editor',
        joinedAt: Date.now()
      });
    }

    // 3. Generate Day slots based on date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    for (let i = 1; i <= diffDays; i++) {
      const dayDate = new Date(start);
      dayDate.setDate(start.getDate() + (i - 1));
      await db.insert(schema.days).values({
        id: generateUUID(),
        tripId,
        dayNumber: i,
        date: dayDate.getTime()
      });
    }

    res.json({ success: true, tripId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add day to trip
app.post('/api/trips/:id/days', async (req, res) => {
  const { id } = req.params;
  try {
    const existingDays = await db.select().from(schema.days).where(eq(schema.days.tripId, id)).orderBy(schema.days.dayNumber);
    const newDayNum = existingDays.length + 1;
    
    let lastDate = Date.now();
    if (existingDays.length > 0) {
      lastDate = existingDays[existingDays.length - 1].date;
    }
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const dayId = generateUUID();
    await db.insert(schema.days).values({
      id: dayId,
      tripId: id,
      dayNumber: newDayNum,
      date: nextDate.getTime()
    });

    // Update trip end date
    await db.update(schema.trips).set({ endDate: nextDate.getTime() }).where(eq(schema.trips.id, id));

    res.json({ success: true, dayId, dayNumber: newDayNum });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// 3. ITINERARY ACTIVITIES
// -------------------------------------------------------------------------

// Add activity
app.post('/api/activities', async (req, res) => {
  const { dayId, name, time, notes, location, lat, lng, transportType, estCost, actCost, costCategory, order } = req.body;
  if (!dayId || !name) {
    return res.status(400).json({ error: 'Missing dayId or name' });
  }

  try {
    const activityId = generateUUID();
    await db.insert(schema.activities).values({
      id: activityId,
      dayId,
      name,
      time: time || '12:00',
      notes: notes || '',
      location: location || '',
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      transportType: transportType || 'walk',
      estCost: estCost ? parseFloat(estCost) : 0,
      actCost: actCost ? parseFloat(actCost) : 0,
      costCategory: costCategory || 'other',
      order: order || 0,
      visited: 0
    });
    res.json({ success: true, activityId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Edit activity
app.put('/api/activities/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    await db.update(schema.activities)
      .set(updates)
      .where(eq(schema.activities.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete activity
app.delete('/api/activities/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.delete(schema.activities).where(eq(schema.activities.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk update order and day (Drag & Drop Reordering)
app.put('/api/activities/reorder', async (req, res) => {
  const { items } = req.body; // Array of { id, dayId, order }
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Missing items array' });
  }

  try {
    // Perform bulk updates in transaction
    await db.transaction(async (tx) => {
      for (const item of items) {
        await tx.update(schema.activities)
          .set({ dayId: item.dayId, order: item.order })
          .where(eq(schema.activities.id, item.id));
      }
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// 4. BUDGET & EXPENSES
// -------------------------------------------------------------------------

// Add group expense
app.post('/api/expenses', async (req, res) => {
  const { tripId, payerId, amount, description, category, splitType, splits } = req.body;
  if (!tripId || !payerId || !amount || !description || !splits || !Array.isArray(splits)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const expenseId = generateUUID();
  try {
    await db.transaction(async (tx) => {
      // 1. Insert Group Expense
      await tx.insert(schema.groupExpenses).values({
        id: expenseId,
        tripId,
        payerId,
        amount: parseFloat(amount),
        description,
        category: category || 'other',
        splitType: splitType || 'equal',
        createdAt: Date.now()
      });

      // 2. Insert individual splits
      for (const s of splits) {
        await tx.insert(schema.expenseSplits).values({
          id: generateUUID(),
          expenseId,
          userId: s.userId,
          amount: parseFloat(s.amount)
        });
      }
    });
    res.json({ success: true, expenseId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete expense
app.delete('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.transaction(async (tx) => {
      await tx.delete(schema.expenseSplits).where(eq(schema.expenseSplits.expenseId, id));
      await tx.delete(schema.groupExpenses).where(eq(schema.groupExpenses.id, id));
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// 5. VOTES & COLLABORATION
// -------------------------------------------------------------------------
app.post('/api/votes', async (req, res) => {
  const { tripId, itemId, itemType, userId, voteType } = req.body;
  try {
    const existing = await db.select().from(schema.votes).where(
      and(
        eq(schema.votes.tripId, tripId),
        eq(schema.votes.itemId, itemId),
        eq(schema.votes.userId, userId)
      )
    );

    if (existing.length > 0) {
      if (existing[0].voteType === voteType) {
        // Toggle off if clicking the same vote again
        await db.delete(schema.votes).where(eq(schema.votes.id, existing[0].id));
      } else {
        // Update vote type
        await db.update(schema.votes).set({ voteType }).where(eq(schema.votes.id, existing[0].id));
      }
    } else {
      await db.insert(schema.votes).values({
        id: generateUUID(),
        tripId,
        itemId,
        itemType,
        userId,
        voteType,
        createdAt: Date.now()
      });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// 6. EMERGENCY CONTACTS
// -------------------------------------------------------------------------
app.post('/api/emergency', async (req, res) => {
  const { tripId, name, relation, phone, note } = req.body;
  try {
    const id = generateUUID();
    await db.insert(schema.emergencyContacts).values({
      id,
      tripId,
      name,
      relation,
      phone,
      note: note || ''
    });
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/emergency/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.delete(schema.emergencyContacts).where(eq(schema.emergencyContacts.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// 7. WEATHER API INTEGRATION
// -------------------------------------------------------------------------
app.get('/api/weather', async (req, res) => {
  const { lat, lng } = req.query;
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;

  if (apiKey && lat && lng) {
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`
      );
      const data = await response.json();
      return res.json(data);
    } catch (err) {
      console.error('Weather API fetch failed, falling back to mock weather:', err);
    }
  }

  // Realistic mock weather fallback
  const mockWeather = {
    list: Array.from({ length: 5 }, (_, i) => {
      const weatherConditions = ['Clear', 'Clouds', 'Rain', 'Clouds', 'Clear'];
      const temps = [28, 25, 23, 26, 29];
      return {
        dt: Date.now() + i * 24 * 60 * 60 * 1000,
        main: { temp: temps[i], humidity: 65 },
        weather: [{ main: weatherConditions[i], description: weatherConditions[i] === 'Rain' ? 'light rain' : 'scattered clouds' }]
      };
    })
  };
  res.json(mockWeather);
});

// -------------------------------------------------------------------------
// 8. GEMINI AI ENDPOINTS
// -------------------------------------------------------------------------

// Helper to query Gemini (with safety wrapper)
async function queryGemini(prompt: string, fallbackJson: any) {
  if (aiClient) {
    try {
      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const text = response.text || '';
      
      // Attempt to clean markdown backticks from JSON responses
      const cleanJsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJsonStr);
    } catch (err) {
      console.error('Gemini API call failed, using rule-based simulation:', err);
    }
  }
  return fallbackJson;
}

// A. Schedule Gap Detection
app.post('/api/ai/gap-check', async (req, res) => {
  const { activities } = req.body; // array of activities
  if (!activities || !Array.isArray(activities)) {
    return res.status(400).json({ error: 'Missing activities array' });
  }

  const prompt = `Analyze this travel itinerary for structural issues. 
Look for:
1. Overlapping times (activities at the same time).
2. Gaps larger than 4 hours during active hours (09:00 - 21:00).
3. Unrealistic travel times (e.g., flight to car trip within 30 mins).
4. Missing meal breaks (no activities near 12:00 or 18:00).

Itinerary: ${JSON.stringify(activities.map(a => ({ name: a.name, time: a.time, transport: a.transportType })))}

Return ONLY a JSON array of issues. Example format:
[
  { "type": "Meal Skip", "message": "No lunch break scheduled around 12:00." },
  { "type": "Tight Schedule", "message": "Only 10 minutes allocated to travel between A and B." }
]`;

  // Rule-based simulation fallback
  const mockIssues: any[] = [];
  
  // Sort activities by time
  const sorted = [...activities].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  
  // Rule 1: Meal checks
  const times = sorted.map(a => a.time || '');
  const hasLunch = times.some(t => {
    const hr = parseInt(t.split(':')[0]);
    return hr >= 11 && hr <= 14;
  });
  if (sorted.length > 0 && !hasLunch) {
    mockIssues.push({ type: 'Meal Skip', message: 'No lunch break scheduled between 11:00 AM and 2:00 PM.' });
  }

  // Rule 2: Travel checks
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (cur.time && next.time) {
      const curHr = parseInt(cur.time.split(':')[0]);
      const curMin = parseInt(cur.time.split(':')[1]);
      const nextHr = parseInt(next.time.split(':')[0]);
      const nextMin = parseInt(next.time.split(':')[1]);

      const diffMin = (nextHr * 60 + nextMin) - (curHr * 60 + curMin);
      if (diffMin > 0 && diffMin < 45 && cur.transportType === 'flight') {
        mockIssues.push({ type: 'Unrealistic Travel Time', message: `Only ${diffMin} minutes between arriving at flight and ${next.name}.` });
      } else if (diffMin === 0) {
        mockIssues.push({ type: 'Overlapping Activities', message: `${cur.name} and ${next.name} are scheduled at the exact same time.` });
      }
    }
  }

  try {
    const results = await queryGemini(prompt, mockIssues);
    res.json(results);
  } catch {
    res.json(mockIssues);
  }
});

// B. Nearby recommendations based on active location
app.post('/api/ai/recommend', async (req, res) => {
  const { destination, activityName, weather } = req.body;

  const prompt = `Recommend 4 places to visit (cafes, photo spots, landmarks, food) near "${activityName}" in "${destination}". The weather is currently "${weather}". 
Return ONLY a JSON array. Example:
[
  { "name": "Cozy Café", "category": "cafe", "reason": "Famous for drip coffee and quiet workspace." },
  { "name": "Sunset Viewpoint", "category": "landmark", "reason": "Excellent panoramic sunset photo spot." }
]`;

  const mockRecommendations = [
    { name: `Local Thai Diner near ${activityName}`, category: 'food', reason: 'Authentic local dining spot within walking distance.' },
    { name: `Scenic Photo Spot`, category: 'landmark', reason: 'Iconic local photography location suitable for current weather.' },
    { name: `Central Cafe & Rest`, category: 'cafe', reason: 'Highly rated coffee stop to rest after visiting.' },
    { name: `Convenience Store / Pharmacy`, category: 'other', reason: 'Quick rest-stop for travel necessities.' }
  ];

  try {
    const results = await queryGemini(prompt, mockRecommendations);
    res.json(results);
  } catch {
    res.json(mockRecommendations);
  }
});

// C. Cost Range Predictor
app.post('/api/ai/predict-cost', async (req, res) => {
  const { activityName, category, destination } = req.body;

  const prompt = `Predict the estimated cost range in local currency for visiting "${activityName}" (category: ${category}) in "${destination}". Include tickets, average meals, or transport if applicable.
Return ONLY a JSON object. Example:
{
  "currency": "USD",
  "minPrice": 15,
  "maxPrice": 45,
  "explanation": "Entry ticket is $15. Budget $30 for a meal or guide fee."
}`;

  const mockPrediction = {
    currency: destination.toLowerCase().includes('thailand') || destination.toLowerCase().includes('bangkok') ? 'THB' : 'USD',
    minPrice: category === 'hotel' ? 1200 : category === 'food' ? 150 : category === 'transport' ? 80 : 250,
    maxPrice: category === 'hotel' ? 3500 : category === 'food' ? 450 : category === 'transport' ? 250 : 700,
    explanation: `Predicted based on average tourist costs in ${destination} for ${category} activities.`
  };

  try {
    const results = await queryGemini(prompt, mockPrediction);
    res.json(results);
  } catch {
    res.json(mockPrediction);
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`Express Backend running on http://localhost:${PORT}`);
});

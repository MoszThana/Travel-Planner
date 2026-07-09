
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// GET /api/trips - List all trips
export async function GET() {
  try {
    
    const db = await getSafeDb();
    const list = await db.select().from(schema.trips).orderBy(schema.trips.createdAt);
    return NextResponse.json(list);
  } catch (err: any) {
    console.error('Error fetching trips:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/trips - Create a new trip
export async function POST(request: Request) {
  try {
    
    const db = await getSafeDb();
    

    const body = await request.json() as any;
    const { name, destination, startDate, endDate, ownerId } = body;
    
    if (!name || !destination || !startDate || !endDate || !ownerId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const tripId = generateUUID();

    // 1. Insert Trip
    await db.insert(schema.trips).values({
      id: tripId,
      name,
      destination,
      startDate: Number(startDate),
      endDate: Number(endDate),
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
    const start = new Date(Number(startDate));
    const end = new Date(Number(endDate));
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

    return NextResponse.json({ success: true, tripId });
  } catch (err: any) {
    console.error('Error creating trip:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}



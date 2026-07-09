
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// GET /api/trips - List trips for a user (or all trips if no userId provided)
export async function GET(request: Request) {
  try {
    const db = await getSafeDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    let list;
    if (userId) {
      const rows = await db.select({
        id: schema.trips.id,
        name: schema.trips.name,
        destination: schema.trips.destination,
        startDate: schema.trips.startDate,
        endDate: schema.trips.endDate,
        ownerId: schema.trips.ownerId,
        createdAt: schema.trips.createdAt,
        role: schema.tripMembers.role
      })
        .from(schema.trips)
        .innerJoin(schema.tripMembers, eq(schema.trips.id, schema.tripMembers.tripId))
        .where(eq(schema.tripMembers.userId, userId))
        .orderBy(schema.trips.createdAt);
      
      list = rows;
    } else {
      list = await db.select().from(schema.trips).orderBy(schema.trips.createdAt);
    }
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

    // Ensure the owner user exists in the database to prevent foreign key errors
    try {
      await db.insert(schema.users).values({
        id: ownerId,
        name: ownerId.replace('user-', ''),
        email: `${ownerId.replace('user-', '')}@example.com`,
        createdAt: Date.now()
      }).onConflictDoNothing();
    } catch (e) {
      // Ignore
    }

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



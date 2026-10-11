import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { requireUser, errorResponse } from '@/lib/access';

export const runtime = 'edge';

// GET /api/trips - Trips the logged-in user belongs to
export async function GET(request: Request) {
  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();

    const list = await db.select({
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

    return NextResponse.json(list);
  } catch (err) {
    return errorResponse(err, 'Error fetching trips:');
  }
}

// POST /api/trips - Create a trip owned by the logged-in user
export async function POST(request: Request) {
  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();

    const body = await request.json() as any;
    const { name, destination, startDate, endDate } = body;

    if (!name || !destination || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const start = new Date(Number(startDate));
    const end = new Date(Number(endDate));
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      return NextResponse.json({ error: 'End date cannot be before start date.' }, { status: 400 });
    }

    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 60) {
      return NextResponse.json({ error: 'Trips can be at most 60 days long.' }, { status: 400 });
    }

    const tripId = crypto.randomUUID();
    const now = Date.now();

    // Trip, owner membership and day slots in one atomic batch
    const dayInserts = Array.from({ length: diffDays }, (_, i) => {
      const dayDate = new Date(start);
      dayDate.setDate(start.getDate() + i);
      return db.insert(schema.days).values({
        id: crypto.randomUUID(),
        tripId,
        dayNumber: i + 1,
        date: dayDate.getTime()
      });
    });

    await db.batch([
      db.insert(schema.trips).values({
        id: tripId,
        name,
        destination,
        startDate: start.getTime(),
        endDate: end.getTime(),
        ownerId: userId,
        createdAt: now
      }),
      db.insert(schema.tripMembers).values({
        id: crypto.randomUUID(),
        tripId,
        userId,
        role: 'owner',
        joinedAt: now
      }),
      ...dayInserts
    ]);

    return NextResponse.json({ success: true, tripId });
  } catch (err) {
    return errorResponse(err, 'Error creating trip:');
  }
}

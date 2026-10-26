
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { requireUser, requireTripRole, errorResponse } from '@/lib/access';
import { logEvent } from '@/lib/events';

export const runtime = 'edge';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// POST /api/trips/[id]/days - Add a day to trip
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    await requireTripRole(db, id, userId, 'editor');

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

    await logEvent(db, id, userId, 'day.added', `Day ${newDayNum}`);
    return NextResponse.json({ success: true, dayId, dayNumber: newDayNum });
  } catch (err) {
    return errorResponse(err, `Error adding day to trip ${id}:`);
  }
}

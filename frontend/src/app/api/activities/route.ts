import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { requireUser, requireTripRole, tripIdForDay, dayLabel, errorResponse } from '@/lib/access';
import { logEvent } from '@/lib/events';

export const runtime = 'edge';

// POST /api/activities - Add activity (trip editors)
export async function POST(request: Request) {
  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    const body = await request.json() as any;
    const { dayId, name, time, notes, location, lat, lng, transportType, estCost, actCost, costCategory, order } = body;

    if (!dayId || !name) {
      return NextResponse.json({ error: 'Missing dayId or name' }, { status: 400 });
    }
    const tripId = await tripIdForDay(db, dayId);
    await requireTripRole(db, tripId, userId, 'editor');

    const activityId = crypto.randomUUID();
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
      visited: 0,
      createdBy: userId,
      updatedBy: userId,
      updatedAt: Date.now()
    });

    await logEvent(db, tripId!, userId, 'activity.added', `${name} · ${await dayLabel(db, dayId)}`);
    return NextResponse.json({ success: true, activityId });
  } catch (err) {
    return errorResponse(err, 'Error adding activity:');
  }
}

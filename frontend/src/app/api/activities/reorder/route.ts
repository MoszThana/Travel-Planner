import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { requireUser, requireTripRole, tripIdForActivity, tripIdForDay, dayLabel, errorResponse } from '@/lib/access';
import { logEvent } from '@/lib/events';

export const runtime = 'edge';

// PUT /api/activities/reorder - Bulk update order and day (Drag & Drop Reordering)
export async function PUT(request: Request) {
  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();

    const body = await request.json() as any;
    const { items } = body; // Array of { id, dayId, order }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Missing items array' }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ success: true });
    }

    // Every activity and target day must belong to one trip the user can edit
    const tripId = await tripIdForActivity(db, items[0].id);
    await requireTripRole(db, tripId, userId, 'editor');
    for (const item of items) {
      if ((await tripIdForActivity(db, item.id)) !== tripId || (await tripIdForDay(db, item.dayId)) !== tripId) {
        return NextResponse.json({ error: 'All activities must belong to the same trip.' }, { status: 400 });
      }
    }

    // Bulk update atomically. Cloudflare D1 rejects BEGIN TRANSACTION, so use batch()
    const updates = items.map((item: any) =>
      db.update(schema.activities)
        .set({ dayId: item.dayId, order: Number(item.order) || 0 })
        .where(eq(schema.activities.id, item.id))
    );
    // batch() is typed as a non-empty tuple; the length check above guarantees that
    await db.batch(updates as [typeof updates[number], ...typeof updates]);
    await logEvent(db, tripId!, userId, 'activity.reordered', await dayLabel(db, items[0].dayId));

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Error reordering activities:');
  }
}

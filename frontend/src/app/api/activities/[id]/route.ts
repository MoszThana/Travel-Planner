import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { requireUser, requireTripRole, tripIdForActivity, tripIdForDay, dayLabel, errorResponse } from '@/lib/access';
import { logEvent } from '@/lib/events';

export const runtime = 'edge';

// Only these fields can be changed from the app
const EDITABLE_FIELDS = [
  'name', 'time', 'notes', 'location', 'lat', 'lng', 'transportType',
  'estCost', 'actCost', 'costCategory', 'order', 'visited', 'dayId',
] as const;

async function findActivity(db: any, id: string) {
  const rows = await db.select({ name: schema.activities.name, dayId: schema.activities.dayId, visited: schema.activities.visited })
    .from(schema.activities).where(eq(schema.activities.id, id)).limit(1);
  return rows[0] as { name: string; dayId: string; visited: number | null } | undefined;
}

// PUT /api/activities/[id] - Edit activity (trip editors)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    const tripId = await tripIdForActivity(db, id);
    await requireTripRole(db, tripId, userId, 'editor');
    const before = await findActivity(db, id);

    const body = await request.json() as any;
    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    // Moving to another day is only allowed within the same trip
    if (updates.dayId && (await tripIdForDay(db, String(updates.dayId))) !== tripId) {
      return NextResponse.json({ error: 'That day belongs to a different trip.' }, { status: 400 });
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    await db.update(schema.activities)
      .set({ ...updates, updatedBy: userId, updatedAt: Date.now() })
      .where(eq(schema.activities.id, id));

    const name = String(updates.name ?? before?.name ?? 'an activity');
    const checkedIn = updates.visited === 1 && before?.visited !== 1;
    await logEvent(
      db, tripId!, userId,
      checkedIn ? 'activity.checked_in' : 'activity.edited',
      `${name} · ${await dayLabel(db, String(updates.dayId ?? before?.dayId))}`
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, `Error updating activity ${id}:`);
  }
}

// DELETE /api/activities/[id] - Delete activity (trip editors)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    const tripId = await tripIdForActivity(db, id);
    await requireTripRole(db, tripId, userId, 'editor');
    const before = await findActivity(db, id);

    // Detach files linked to this activity (they stay in the trip's file list), then delete
    await db.batch([
      db.update(schema.attachments).set({ activityId: null }).where(eq(schema.attachments.activityId, id)),
      db.delete(schema.activities).where(eq(schema.activities.id, id))
    ]);

    if (before) {
      await logEvent(db, tripId!, userId, 'activity.deleted', `${before.name} · ${await dayLabel(db, before.dayId)}`);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, `Error deleting activity ${id}:`);
  }
}

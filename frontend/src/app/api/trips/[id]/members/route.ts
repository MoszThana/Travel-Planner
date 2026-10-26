import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq, and } from 'drizzle-orm';
import { requireUser, requireTripRole, errorResponse } from '@/lib/access';
import { logEvent } from '@/lib/events';

export const runtime = 'edge';

const ASSIGNABLE_ROLES = ['editor', 'viewer'];

// POST /api/trips/[id]/members - Owner invites a member or changes their role
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await params;
  try {
    const currentUserId = await requireUser(request);
    const db = await getSafeDb();
    await requireTripRole(db, tripId, currentUserId, 'owner');

    const body = await request.json() as any;
    const { userId, role } = body;

    if (!userId || !ASSIGNABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Choose a profile and a role (editor or viewer).' }, { status: 400 });
    }

    const tripRows = await db.select({ ownerId: schema.trips.ownerId }).from(schema.trips).where(eq(schema.trips.id, tripId)).limit(1);
    if (tripRows[0]?.ownerId === userId) {
      return NextResponse.json({ error: "The owner's role can't be changed." }, { status: 400 });
    }

    const userCheck = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (userCheck.length === 0) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const existing = await db.select({ id: schema.tripMembers.id })
      .from(schema.tripMembers)
      .where(and(eq(schema.tripMembers.tripId, tripId), eq(schema.tripMembers.userId, userId)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(schema.tripMembers).set({ role }).where(eq(schema.tripMembers.id, existing[0].id));
      await logEvent(db, tripId, currentUserId, 'member.role_changed', `${userCheck[0].name} → ${role}`);
      return NextResponse.json({ success: true, updated: true });
    }

    await db.insert(schema.tripMembers).values({
      id: crypto.randomUUID(),
      tripId,
      userId,
      role,
      joinedAt: Date.now()
    });
    await logEvent(db, tripId, currentUserId, 'member.added', `${userCheck[0].name} (${role})`);
    return NextResponse.json({ success: true, added: true });
  } catch (err) {
    return errorResponse(err, 'Error managing trip member:');
  }
}

// DELETE /api/trips/[id]/members?userId=... - Owner removes a member
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await params;
  try {
    const currentUserId = await requireUser(request);
    const db = await getSafeDb();
    await requireTripRole(db, tripId, currentUserId, 'owner');

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    const tripRows = await db.select({ ownerId: schema.trips.ownerId }).from(schema.trips).where(eq(schema.trips.id, tripId)).limit(1);
    if (tripRows[0]?.ownerId === userId) {
      return NextResponse.json({ error: 'Cannot remove the owner of the trip' }, { status: 400 });
    }

    const [removed] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    await db.delete(schema.tripMembers)
      .where(and(eq(schema.tripMembers.tripId, tripId), eq(schema.tripMembers.userId, userId)));
    await logEvent(db, tripId, currentUserId, 'member.removed', removed?.name || 'a member');

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Error removing trip member:');
  }
}

import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq, and } from 'drizzle-orm';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'tmem-' + Math.random().toString(36).substring(2, 15);
}

// POST /api/trips/[id]/members - Invite or update a member's role
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await params;
  try {
    const db = await getSafeDb();
    const body = await request.json() as any;
    const { userId, role } = body; // role: 'editor' | 'viewer'

    if (!userId || !role) {
      return NextResponse.json({ error: 'Missing userId or role' }, { status: 400 });
    }

    // Check if user exists
    const userCheck = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (userCheck.length === 0) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Check if already a member
    const existing = await db.select()
      .from(schema.tripMembers)
      .where(
        and(
          eq(schema.tripMembers.tripId, tripId),
          eq(schema.tripMembers.userId, userId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update role
      await db.update(schema.tripMembers)
        .set({ role })
        .where(eq(schema.tripMembers.id, existing[0].id));
      
      return NextResponse.json({ success: true, updated: true });
    } else {
      // Add new member
      await db.insert(schema.tripMembers).values({
        id: generateUUID(),
        tripId,
        userId,
        role,
        joinedAt: Date.now()
      });

      return NextResponse.json({ success: true, added: true });
    }
  } catch (err: any) {
    console.error('Error managing trip member:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/trips/[id]/members - Remove a member from the trip
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await params;
  try {
    const db = await getSafeDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    // Check if it's the owner trying to be deleted (owners cannot be removed from their own trips)
    const tripRows = await db.select().from(schema.trips).where(eq(schema.trips.id, tripId)).limit(1);
    if (tripRows.length > 0 && tripRows[0].ownerId === userId) {
      return NextResponse.json({ error: 'Cannot remove the owner of the trip' }, { status: 400 });
    }

    await db.delete(schema.tripMembers)
      .where(
        and(
          eq(schema.tripMembers.tripId, tripId),
          eq(schema.tripMembers.userId, userId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error removing trip member:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { desc, eq, inArray } from 'drizzle-orm';
import { requireUser, requireTripRole, errorResponse } from '@/lib/access';
import { CURRENCY_CODES } from '@/utils/money';
import { logEvent } from '@/lib/events';

export const runtime = 'edge';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    await requireTripRole(db, id, userId, 'viewer');

    const tripRows = await db.select().from(schema.trips).where(eq(schema.trips.id, id));
    if (tripRows.length === 0) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
    const trip = tripRows[0];

    // Fetch Days
    const tripDays = await db.select().from(schema.days).where(eq(schema.days.tripId, id)).orderBy(schema.days.dayNumber);

    // Fetch Activities for all days
    const dayIds = tripDays.map((d: any) => d.id);
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
    const expenseIds = expenses.map((e: any) => e.id);
    let splits: any[] = [];
    if (expenseIds.length > 0) {
      splits = await db.select().from(schema.expenseSplits).where(inArray(schema.expenseSplits.expenseId, expenseIds));
    }

    // Fetch Emergency Contacts
    const emergency = await db.select().from(schema.emergencyContacts).where(eq(schema.emergencyContacts.tripId, id));

    // Fetch Votes
    const votes = await db.select().from(schema.votes).where(eq(schema.votes.tripId, id));

    // Latest changes for "What's new" (name kept even if the person left the trip)
    const events = await db.select({
      id: schema.tripEvents.id,
      userId: schema.tripEvents.userId,
      userName: schema.users.name,
      userAvatar: schema.users.avatarUrl,
      type: schema.tripEvents.type,
      summary: schema.tripEvents.summary,
      createdAt: schema.tripEvents.createdAt,
    })
      .from(schema.tripEvents)
      .leftJoin(schema.users, eq(schema.tripEvents.userId, schema.users.id))
      .where(eq(schema.tripEvents.tripId, id))
      .orderBy(desc(schema.tripEvents.createdAt))
      .limit(30);

    return NextResponse.json({
      ...trip,
      days: tripDays,
      activities: tripActivities,
      members,
      expenses,
      splits,
      emergency,
      votes,
      events
    });
  } catch (err) {
    return errorResponse(err, `Error fetching trip ${id}:`);
  }
}

// PATCH /api/trips/[id] - Update shared trip settings: budget and currency (trip editors)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    await requireTripRole(db, id, userId, 'editor');

    const body = await request.json() as any;
    const updates: { budget?: number | null; currency?: string } = {};

    if (body.budget !== undefined) {
      const budget = body.budget === null || body.budget === '' ? null : Number(body.budget);
      if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
        return NextResponse.json({ error: 'Budget must be a positive number.' }, { status: 400 });
      }
      updates.budget = budget;
    }
    if (body.currency !== undefined) {
      if (!CURRENCY_CODES.includes(body.currency)) {
        return NextResponse.json({ error: 'Unsupported currency.' }, { status: 400 });
      }
      updates.currency = body.currency;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    await db.update(schema.trips).set(updates).where(eq(schema.trips.id, id));
    await logEvent(db, id, userId, 'trip.edited', Object.keys(updates).join(', '));
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, `Error updating trip ${id}:`);
  }
}

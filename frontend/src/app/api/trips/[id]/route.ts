
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq, inArray } from 'drizzle-orm';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    
    const db = await getSafeDb();

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

    return NextResponse.json({
      ...trip,
      days: tripDays,
      activities: tripActivities,
      members,
      expenses,
      splits,
      emergency,
      votes
    });
  } catch (err: any) {
    console.error(`Error fetching trip ${id}:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

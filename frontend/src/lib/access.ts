import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { schema } from '@/db';
import { getSessionUserId } from './auth';

// Who may do what on a trip:
//   viewer - read the trip
//   editor - also add/edit activities, days, expenses, contacts, files, votes
//   owner  - also manage members
export type TripRole = 'viewer' | 'editor' | 'owner';
const RANK: Record<TripRole, number> = { viewer: 1, editor: 2, owner: 3 };

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The logged-in user's id, or a 401. */
export async function requireUser(request: Request): Promise<string> {
  const userId = await getSessionUserId(request);
  if (!userId) throw new HttpError(401, 'Please log in again.');
  return userId;
}

/** The user's role on the trip, or a 404/403 if they may not do this. */
export async function requireTripRole(db: any, tripId: string | null | undefined, userId: string, min: TripRole): Promise<TripRole> {
  if (!tripId) throw new HttpError(404, 'Trip not found');
  const rows = await db.select({ role: schema.tripMembers.role })
    .from(schema.tripMembers)
    .where(and(eq(schema.tripMembers.tripId, tripId), eq(schema.tripMembers.userId, userId)))
    .limit(1);

  // Not a member: answer 404 so trip ids can't be probed
  if (rows.length === 0) throw new HttpError(404, 'Trip not found');

  const role = rows[0].role as TripRole;
  if ((RANK[role] ?? 0) < RANK[min]) {
    throw new HttpError(403, min === 'owner' ? 'Only the trip owner can do this.' : 'You have view-only access to this trip.');
  }
  return role;
}

// Look up which trip a child record belongs to
export async function tripIdForDay(db: any, dayId: string): Promise<string | null> {
  const rows = await db.select({ tripId: schema.days.tripId }).from(schema.days).where(eq(schema.days.id, dayId)).limit(1);
  return rows[0]?.tripId ?? null;
}

export async function tripIdForActivity(db: any, activityId: string): Promise<string | null> {
  const rows = await db.select({ tripId: schema.days.tripId })
    .from(schema.activities)
    .innerJoin(schema.days, eq(schema.activities.dayId, schema.days.id))
    .where(eq(schema.activities.id, activityId))
    .limit(1);
  return rows[0]?.tripId ?? null;
}

export async function tripIdForExpense(db: any, expenseId: string): Promise<string | null> {
  const rows = await db.select({ tripId: schema.groupExpenses.tripId }).from(schema.groupExpenses).where(eq(schema.groupExpenses.id, expenseId)).limit(1);
  return rows[0]?.tripId ?? null;
}

export async function tripIdForEmergencyContact(db: any, contactId: string): Promise<string | null> {
  const rows = await db.select({ tripId: schema.emergencyContacts.tripId }).from(schema.emergencyContacts).where(eq(schema.emergencyContacts.id, contactId)).limit(1);
  return rows[0]?.tripId ?? null;
}

export async function tripIdForAttachmentKey(db: any, storageKey: string): Promise<string | null> {
  const rows = await db.select({ tripId: schema.attachments.tripId }).from(schema.attachments).where(eq(schema.attachments.oneDriveItemId, storageKey)).limit(1);
  return rows[0]?.tripId ?? null;
}

/** Turn a thrown error into a JSON response (HttpError keeps its status). */
export function errorResponse(err: unknown, context: string) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(context, err);
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 });
}

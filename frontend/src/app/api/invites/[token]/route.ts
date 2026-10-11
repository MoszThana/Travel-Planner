import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { and, eq } from 'drizzle-orm';
import { requireUser, errorResponse } from '@/lib/access';

export const runtime = 'edge';

const ROLE_RANK: Record<string, number> = { viewer: 1, editor: 2, owner: 3 };

// Valid = exists, not revoked, not expired
async function findValidInvite(db: any, token: string) {
  const rows = await db.select().from(schema.tripInvites).where(eq(schema.tripInvites.token, token)).limit(1);
  const invite = rows[0];
  if (!invite || invite.revokedAt || invite.expiresAt < Date.now()) return null;
  return invite;
}

// GET /api/invites/[token] - Preview for whoever holds the link (no login needed):
// trip name, dates and who invited them. Nothing else about the trip is revealed.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const db = await getSafeDb();
    const invite = await findValidInvite(db, token);
    if (!invite) {
      return NextResponse.json({ error: 'This invite link has expired or was cancelled.' }, { status: 404 });
    }

    const [trip] = await db.select({
      name: schema.trips.name,
      destination: schema.trips.destination,
      startDate: schema.trips.startDate,
      endDate: schema.trips.endDate,
    }).from(schema.trips).where(eq(schema.trips.id, invite.tripId)).limit(1);
    const [inviter] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, invite.createdBy)).limit(1);

    return NextResponse.json({
      trip,
      inviterName: inviter?.name || 'A friend',
      role: invite.role,
      expiresAt: invite.expiresAt,
    });
  } catch (err) {
    return errorResponse(err, 'Error reading invite:');
  }
}

// POST /api/invites/[token] - Accept: join the trip as the logged-in user
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    const invite = await findValidInvite(db, token);
    if (!invite) {
      return NextResponse.json({ error: 'This invite link has expired or was cancelled.' }, { status: 404 });
    }

    const existing = await db.select({ id: schema.tripMembers.id, role: schema.tripMembers.role })
      .from(schema.tripMembers)
      .where(and(eq(schema.tripMembers.tripId, invite.tripId), eq(schema.tripMembers.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.tripMembers).values({
        id: crypto.randomUUID(),
        tripId: invite.tripId,
        userId,
        role: invite.role,
        joinedAt: Date.now(),
      });
    } else if ((ROLE_RANK[existing[0].role] ?? 0) < (ROLE_RANK[invite.role] ?? 0)) {
      // Already a member: an invite can raise the role but never lower it
      await db.update(schema.tripMembers).set({ role: invite.role }).where(eq(schema.tripMembers.id, existing[0].id));
    }

    return NextResponse.json({ success: true, tripId: invite.tripId });
  } catch (err) {
    return errorResponse(err, 'Error accepting invite:');
  }
}

import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { and, eq } from 'drizzle-orm';
import { requireUser, requireTripRole, errorResponse } from '@/lib/access';
import { hashPin } from '@/lib/pin';

export const runtime = 'edge';

const RESET_HOURS = 24;

// POST /api/trips/[id]/members/reset-code { userId } - Trip owner creates a one-time
// 6-digit code so a member who forgot their PIN can choose a new one.
// The code is shown once to the owner (to send privately) and stored only as a hash.
// The member's current PIN keeps working until the code is used.
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
    const userId = String(body.userId || '');
    if (!userId || userId === currentUserId) {
      return NextResponse.json({ error: 'Choose another member. To change your own PIN, use My profile.' }, { status: 400 });
    }

    const member = await db.select({ id: schema.tripMembers.id })
      .from(schema.tripMembers)
      .where(and(eq(schema.tripMembers.tripId, tripId), eq(schema.tripMembers.userId, userId)))
      .limit(1);
    if (member.length === 0) {
      return NextResponse.json({ error: 'That person is not a member of this trip.' }, { status: 404 });
    }

    // 6 random digits (uniform: reject values that would bias the modulo)
    let n: number;
    do {
      n = crypto.getRandomValues(new Uint32Array(1))[0];
    } while (n >= 4294000000);
    const code = String(n % 1000000).padStart(6, '0');
    const expiresAt = Date.now() + RESET_HOURS * 60 * 60 * 1000;

    await db.update(schema.users)
      .set({ resetCodeHash: await hashPin(code), resetExpires: expiresAt })
      .where(eq(schema.users.id, userId));

    return NextResponse.json({ success: true, code, expiresAt });
  } catch (err) {
    return errorResponse(err, 'Error creating PIN reset code:');
  }
}

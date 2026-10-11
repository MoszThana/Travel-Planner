import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { and, eq } from 'drizzle-orm';
import { requireUser, requireTripRole, errorResponse } from '@/lib/access';

export const runtime = 'edge';

// POST /api/votes - Like/dislike an item; always cast as the logged-in user (any trip member)
export async function POST(request: Request) {
  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();

    const body = await request.json() as any;
    const { tripId, itemId, itemType } = body;
    const voteType = Number(body.voteType);

    if (!tripId || !itemId || !itemType || (voteType !== 1 && voteType !== -1)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    await requireTripRole(db, tripId, userId, 'viewer');

    const existing = await db.select().from(schema.votes).where(
      and(
        eq(schema.votes.tripId, tripId),
        eq(schema.votes.itemId, itemId),
        eq(schema.votes.userId, userId)
      )
    );

    if (existing.length > 0) {
      if (existing[0].voteType === voteType) {
        // Toggle off if clicking the same vote again
        await db.delete(schema.votes).where(eq(schema.votes.id, existing[0].id));
      } else {
        await db.update(schema.votes).set({ voteType }).where(eq(schema.votes.id, existing[0].id));
      }
    } else {
      await db.insert(schema.votes).values({
        id: crypto.randomUUID(),
        tripId,
        itemId,
        itemType,
        userId,
        voteType,
        createdAt: Date.now()
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Error casting vote:');
  }
}


import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { and, eq } from 'drizzle-orm';

export const runtime = 'edge';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// POST /api/votes - Cast or toggle vote
export async function POST(request: Request) {
  try {
    
    const db = getSafeDb();

    const body = await request.json() as any;
    const { tripId, itemId, itemType, userId, voteType } = body;

    if (!tripId || !itemId || !itemType || !userId || voteType === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const existing = await db.select().from(schema.votes).where(
      and(
        eq(schema.votes.tripId, tripId),
        eq(schema.votes.itemId, itemId),
        eq(schema.votes.userId, userId)
      )
    );

    if (existing.length > 0) {
      if (existing[0].voteType === Number(voteType)) {
        // Toggle off if clicking the same vote again
        await db.delete(schema.votes).where(eq(schema.votes.id, existing[0].id));
      } else {
        // Update vote type
        await db.update(schema.votes).set({ voteType: Number(voteType) }).where(eq(schema.votes.id, existing[0].id));
      }
    } else {
      await db.insert(schema.votes).values({
        id: generateUUID(),
        tripId,
        itemId,
        itemType,
        userId,
        voteType: Number(voteType),
        createdAt: Date.now()
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error casting vote:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


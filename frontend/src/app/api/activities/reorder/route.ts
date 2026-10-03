
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

// PUT /api/activities/reorder - Bulk update order and day (Drag & Drop Reordering)
export async function PUT(request: Request) {
  try {
    
    const db = await getSafeDb();

    const body = await request.json() as any;
    const { items } = body; // Array of { id, dayId, order }
    
    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Missing items array' }, { status: 400 });
    }

    // Bulk update atomically. Cloudflare D1 rejects BEGIN TRANSACTION, so use batch()
    if (items.length > 0) {
      const updates = items.map((item: any) =>
        db.update(schema.activities)
          .set({ dayId: item.dayId, order: item.order })
          .where(eq(schema.activities.id, item.id))
      );
      // batch() is typed as a non-empty tuple; the length check above guarantees that
      await db.batch(updates as [typeof updates[number], ...typeof updates]);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error reordering activities:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}



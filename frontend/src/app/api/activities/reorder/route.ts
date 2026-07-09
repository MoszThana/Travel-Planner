
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

// PUT /api/activities/reorder - Bulk update order and day (Drag & Drop Reordering)
export async function PUT(request: Request) {
  try {
    
    const db = await getSafeDb();

    const body = await request.json() as any;
    const { items } = body; // Array of { id, dayId, order }
    
    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Missing items array' }, { status: 400 });
    }

    // Perform bulk updates in a transaction
    await db.transaction(async (tx: any) => {
      for (const item of items) {
        await tx.update(schema.activities)
          .set({ dayId: item.dayId, order: item.order })
          .where(eq(schema.activities.id, item.id));
      }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error reordering activities:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}



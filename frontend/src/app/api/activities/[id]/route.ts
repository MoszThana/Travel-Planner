
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

// PUT /api/activities/[id] - Edit activity
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    
    const db = getSafeDb();

    const updates = await request.json() as any;
    await db.update(schema.activities)
      .set(updates)
      .where(eq(schema.activities.id, id));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`Error updating activity ${id}:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/activities/[id] - Delete activity
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    
    const db = getSafeDb();

    await db.delete(schema.activities).where(eq(schema.activities.id, id));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`Error deleting activity ${id}:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

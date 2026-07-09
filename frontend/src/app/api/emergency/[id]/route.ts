
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

// DELETE /api/emergency/[id] - Delete emergency contact
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    
    const db = await getSafeDb();

    await db.delete(schema.emergencyContacts).where(eq(schema.emergencyContacts.id, id));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`Error deleting emergency contact ${id}:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

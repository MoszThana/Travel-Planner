import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { requireUser, requireTripRole, tripIdForEmergencyContact, errorResponse } from '@/lib/access';

export const runtime = 'edge';

// DELETE /api/emergency/[id] - Remove emergency contact (trip editors)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    await requireTripRole(db, await tripIdForEmergencyContact(db, id), userId, 'editor');

    await db.delete(schema.emergencyContacts).where(eq(schema.emergencyContacts.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, `Error deleting emergency contact ${id}:`);
  }
}

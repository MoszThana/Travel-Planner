import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { requireUser, requireTripRole, tripIdForEmergencyContact, errorResponse } from '@/lib/access';
import { logEvent } from '@/lib/events';

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
    const tripId = await tripIdForEmergencyContact(db, id);
    await requireTripRole(db, tripId, userId, 'editor');
    const [before] = await db.select({ name: schema.emergencyContacts.name }).from(schema.emergencyContacts).where(eq(schema.emergencyContacts.id, id)).limit(1);

    await db.delete(schema.emergencyContacts).where(eq(schema.emergencyContacts.id, id));
    await logEvent(db, tripId!, userId, 'contact.deleted', before?.name || 'a contact');
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, `Error deleting emergency contact ${id}:`);
  }
}

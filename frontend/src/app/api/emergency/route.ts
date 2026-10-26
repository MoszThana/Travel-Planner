import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { requireUser, requireTripRole, errorResponse } from '@/lib/access';
import { logEvent } from '@/lib/events';

export const runtime = 'edge';

// POST /api/emergency - Add emergency contact (trip editors)
export async function POST(request: Request) {
  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();

    const body = await request.json() as any;
    const { tripId, name, relation, phone, note } = body;

    if (!tripId || !name || !relation || !phone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    await requireTripRole(db, tripId, userId, 'editor');

    const id = crypto.randomUUID();
    await db.insert(schema.emergencyContacts).values({
      id,
      tripId,
      name,
      relation,
      phone,
      note: note || ''
    });

    await logEvent(db, tripId, userId, 'contact.added', name);
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return errorResponse(err, 'Error adding emergency contact:');
  }
}

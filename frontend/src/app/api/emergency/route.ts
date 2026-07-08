
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';

export const runtime = 'edge';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// POST /api/emergency - Add emergency contact
export async function POST(request: Request) {
  try {
    
    const db = getSafeDb();

    const body = await request.json() as any;
    const { tripId, name, relation, phone, note } = body;

    if (!tripId || !name || !relation || !phone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const id = generateUUID();
    await db.insert(schema.emergencyContacts).values({
      id,
      tripId,
      name,
      relation,
      phone,
      note: note || ''
    });

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error('Error adding emergency contact:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


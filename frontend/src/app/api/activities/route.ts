
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';

export const runtime = 'edge';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// POST /api/activities - Add activity
export async function POST(request: Request) {
  try {
    
    const db = getSafeDb();
    const body = await request.json() as any;
    const { dayId, name, time, notes, location, lat, lng, transportType, estCost, actCost, costCategory, order } = body;
    
    if (!dayId || !name) {
      return NextResponse.json({ error: 'Missing dayId or name' }, { status: 400 });
    }

    const activityId = generateUUID();
    await db.insert(schema.activities).values({
      id: activityId,
      dayId,
      name,
      time: time || '12:00',
      notes: notes || '',
      location: location || '',
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      transportType: transportType || 'walk',
      estCost: estCost ? parseFloat(estCost) : 0,
      actCost: actCost ? parseFloat(actCost) : 0,
      costCategory: costCategory || 'other',
      order: order || 0,
      visited: 0
    });

    return NextResponse.json({ success: true, activityId });
  } catch (err: any) {
    console.error('Error adding activity:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


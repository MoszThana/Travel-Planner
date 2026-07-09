import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

// POST /api/users/login - Login with userId and 4-digit PIN
export async function POST(request: Request) {
  try {
    const db = await getSafeDb();
    const body = await request.json() as any;
    const { userId, pin } = body;

    if (!userId || !pin) {
      return NextResponse.json({ error: 'Missing userId or PIN' }, { status: 400 });
    }

    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (userRows.length === 0) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const user = userRows[0];

    // Check PIN. Support blank or null PIN for seeded legacy/mock profiles on first run
    const savedPin = user.pin || '1234'; 
    if (savedPin !== pin.trim()) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      }
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

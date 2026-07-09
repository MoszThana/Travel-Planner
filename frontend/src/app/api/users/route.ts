import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'user-' + Math.random().toString(36).substring(2, 15);
}

// GET /api/users - Get all profiles (excluding PIN)
export async function GET() {
  try {
    const db = await getSafeDb();
    const list = await db.select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      avatarUrl: schema.users.avatarUrl,
      createdAt: schema.users.createdAt,
    }).from(schema.users).orderBy(schema.users.createdAt);

    return NextResponse.json(list);
  } catch (err: any) {
    console.error('Error fetching users:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/users - Create new profile
export async function POST(request: Request) {
  try {
    const db = await getSafeDb();
    const body = await request.json() as any;
    const { name, email, avatarUrl, pin } = body;

    if (!name || !email || !pin) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (pin.length !== 4 || isNaN(Number(pin))) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
    }

    // Check if email already exists
    const existing = await db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase())).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }

    const userId = generateUUID();
    const avatar = avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`;

    await db.insert(schema.users).values({
      id: userId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      avatarUrl: avatar,
      pin: pin.trim(),
      createdAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        avatarUrl: avatar
      }
    });
  } catch (err: any) {
    console.error('Error creating user:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

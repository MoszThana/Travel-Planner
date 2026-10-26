import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { createSessionCookie, getSessionUserId } from '@/lib/auth';
import { hashPin, isValidPin } from '@/lib/pin';

export const runtime = 'edge';

// GET /api/users - Profiles for the login picker and member invites.
// Logged-out visitors only see names and avatars; emails are shown to logged-in users.
export async function GET(request: Request) {
  try {
    const db = await getSafeDb();
    const loggedIn = !!(await getSessionUserId(request));

    const list = await db.select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      avatarUrl: schema.users.avatarUrl,
      createdAt: schema.users.createdAt,
    }).from(schema.users).orderBy(schema.users.createdAt);

    return NextResponse.json(
      loggedIn ? list : list.map(({ email: _email, ...rest }) => rest)
    );
  } catch (err: any) {
    console.error('Error fetching users:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/users - Create a profile and log it in
export async function POST(request: Request) {
  try {
    const db = await getSafeDb();
    const body = await request.json() as any;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';

    if (!name || !email) {
      return NextResponse.json({ error: 'Please enter your name and email.', code: 'need_all_fields' }, { status: 400 });
    }
    if (!isValidPin(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits', code: 'need_new_pin' }, { status: 400 });
    }

    const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Email already registered', code: 'email_taken' }, { status: 400 });
    }

    const userId = crypto.randomUUID();
    const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`;

    await db.insert(schema.users).values({
      id: userId,
      name,
      email,
      avatarUrl: avatar,
      pin: await hashPin(pin),
      createdAt: Date.now(),
    });

    const response = NextResponse.json({
      success: true,
      user: { id: userId, name, email, avatarUrl: avatar }
    });
    response.headers.set('Set-Cookie', await createSessionCookie(userId));
    return response;
  } catch (err: any) {
    console.error('Error creating user:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

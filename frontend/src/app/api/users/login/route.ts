import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { createSessionCookie } from '@/lib/auth';
import { hashPin, isValidPin, verifyPin, MAX_FAILED_ATTEMPTS, LOCK_MINUTES } from '@/lib/pin';

export const runtime = 'edge';

// POST /api/users/login - Log in with a profile id and 4-digit PIN; sets the session cookie
export async function POST(request: Request) {
  try {
    const db = await getSafeDb();
    const body = await request.json() as any;
    const { userId, pin } = body;

    if (!userId || !isValidPin(typeof pin === 'string' ? pin.trim() : pin)) {
      return NextResponse.json({ error: 'Choose a profile and enter your 4-digit PIN.', code: 'need_profile_and_pin' }, { status: 400 });
    }
    const enteredPin = pin.trim();

    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (userRows.length === 0) {
      return NextResponse.json({ error: 'Profile not found', code: 'not_found' }, { status: 404 });
    }
    const user = userRows[0];
    const now = Date.now();

    if (user.lockedUntil && user.lockedUntil > now) {
      const minutes = Math.ceil((user.lockedUntil - now) / 60000);
      return NextResponse.json(
        { error: `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, code: 'locked', minutes },
        { status: 429 }
      );
    }

    if (!user.pin) {
      return NextResponse.json({ error: 'This profile has no PIN set and cannot be used to log in.', code: 'no_pin' }, { status: 403 });
    }

    const { ok, needsUpgrade } = await verifyPin(enteredPin, user.pin);

    if (!ok) {
      const attempts = (user.failedAttempts || 0) + 1;
      const locked = attempts >= MAX_FAILED_ATTEMPTS;
      await db.update(schema.users)
        .set(locked
          ? { failedAttempts: 0, lockedUntil: now + LOCK_MINUTES * 60000 }
          : { failedAttempts: attempts })
        .where(eq(schema.users.id, user.id));

      return NextResponse.json(
        {
          error: locked
            ? `Too many wrong PINs. This profile is locked for ${LOCK_MINUTES} minutes.`
            : `Incorrect PIN. ${MAX_FAILED_ATTEMPTS - attempts} ${MAX_FAILED_ATTEMPTS - attempts === 1 ? 'try' : 'tries'} left.`,
          code: locked ? 'locked' : 'pin_wrong',
          minutes: LOCK_MINUTES,
          left: MAX_FAILED_ATTEMPTS - attempts
        },
        { status: locked ? 429 : 401 }
      );
    }

    // Success: reset the counter and replace a legacy plain-text PIN with a hash
    await db.update(schema.users)
      .set({
        failedAttempts: 0,
        lockedUntil: null,
        ...(needsUpgrade ? { pin: await hashPin(enteredPin) } : {})
      })
      .where(eq(schema.users.id, user.id));

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      }
    });
    response.headers.set('Set-Cookie', await createSessionCookie(user.id));
    return response;
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

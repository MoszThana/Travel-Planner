import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { createSessionCookie } from '@/lib/auth';
import { hashPin, isValidPin, verifyPin, MAX_FAILED_ATTEMPTS, LOCK_MINUTES } from '@/lib/pin';
import { errorResponse } from '@/lib/access';

export const runtime = 'edge';

// POST /api/users/reset-pin { userId, code, newPin } - Choose a new PIN with a one-time
// reset code from a trip owner. Wrong codes count towards the same lockout as wrong PINs.
export async function POST(request: Request) {
  try {
    const db = await getSafeDb();
    const body = await request.json() as any;
    const userId = String(body.userId || '');
    const code = String(body.code || '').trim();
    const newPin = String(body.newPin || '').trim();

    if (!userId || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Enter the 6-digit reset code.', code: 'need_reset_code' }, { status: 400 });
    }
    if (!isValidPin(newPin)) {
      return NextResponse.json({ error: 'Your new PIN must be exactly 4 digits.', code: 'need_new_pin' }, { status: 400 });
    }

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!user) {
      return NextResponse.json({ error: 'Profile not found', code: 'not_found' }, { status: 404 });
    }

    const now = Date.now();
    if (user.lockedUntil && user.lockedUntil > now) {
      const minutes = Math.ceil((user.lockedUntil - now) / 60000);
      return NextResponse.json({ error: `Too many wrong tries. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, code: 'locked', minutes }, { status: 429 });
    }
    if (!user.resetCodeHash || !user.resetExpires || user.resetExpires < now) {
      return NextResponse.json({ error: 'No valid reset code. Ask the trip owner for a new one.', code: 'reset_expired' }, { status: 400 });
    }

    const { ok } = await verifyPin(code, user.resetCodeHash);
    if (!ok) {
      const attempts = (user.failedAttempts || 0) + 1;
      const locked = attempts >= MAX_FAILED_ATTEMPTS;
      await db.update(schema.users)
        .set(locked ? { failedAttempts: 0, lockedUntil: now + LOCK_MINUTES * 60000 } : { failedAttempts: attempts })
        .where(eq(schema.users.id, userId));
      return NextResponse.json(
        { error: locked ? `Too many wrong tries. Locked for ${LOCK_MINUTES} minutes.` : 'That reset code is not right.', code: locked ? 'locked' : 'reset_wrong', minutes: LOCK_MINUTES },
        { status: locked ? 429 : 401 }
      );
    }

    // Code used once: set the new PIN, clear the code and any lock, and log in
    await db.update(schema.users)
      .set({ pin: await hashPin(newPin), resetCodeHash: null, resetExpires: null, failedAttempts: 0, lockedUntil: null })
      .where(eq(schema.users.id, userId));

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
    });
    response.headers.set('Set-Cookie', await createSessionCookie(user.id));
    return response;
  } catch (err) {
    return errorResponse(err, 'Error resetting PIN:');
  }
}

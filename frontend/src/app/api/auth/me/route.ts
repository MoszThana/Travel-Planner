import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { clearSessionCookie, getSessionUserId } from '@/lib/auth';

export const runtime = 'edge';

// GET /api/auth/me - The logged-in user, from the session cookie
export async function GET(request: Request) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    const db = await getSafeDb();
    const rows = await db.select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      avatarUrl: schema.users.avatarUrl,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);

    if (rows.length === 0) {
      // Profile was deleted: drop the stale cookie
      const response = NextResponse.json({ error: 'Not logged in' }, { status: 401 });
      response.headers.set('Set-Cookie', clearSessionCookie());
      return response;
    }

    return NextResponse.json({ user: rows[0] });
  } catch (err: any) {
    console.error('Error reading session:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

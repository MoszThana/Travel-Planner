import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { requireUser, requireTripRole, errorResponse } from '@/lib/access';

export const runtime = 'edge';

const INVITE_DAYS = 14;
const ROLES = ['editor', 'viewer'];

// 24 random bytes, base64url: unguessable and safe in a URL
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// GET /api/trips/[id]/invites - Active invite links (owner)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await params;
  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    await requireTripRole(db, tripId, userId, 'owner');

    const list = await db.select({
      token: schema.tripInvites.token,
      role: schema.tripInvites.role,
      createdAt: schema.tripInvites.createdAt,
      expiresAt: schema.tripInvites.expiresAt,
    })
      .from(schema.tripInvites)
      .where(and(
        eq(schema.tripInvites.tripId, tripId),
        isNull(schema.tripInvites.revokedAt),
        gt(schema.tripInvites.expiresAt, Date.now())
      ))
      .orderBy(schema.tripInvites.createdAt);

    return NextResponse.json(list);
  } catch (err) {
    return errorResponse(err, 'Error listing invites:');
  }
}

// POST /api/trips/[id]/invites - Create an invite link { role } (owner)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await params;
  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    await requireTripRole(db, tripId, userId, 'owner');

    const body = await request.json() as any;
    const role = ROLES.includes(body.role) ? body.role : 'editor';
    const now = Date.now();
    const invite = {
      token: newToken(),
      tripId,
      role,
      createdBy: userId,
      createdAt: now,
      expiresAt: now + INVITE_DAYS * 24 * 60 * 60 * 1000,
    };

    await db.insert(schema.tripInvites).values(invite);
    return NextResponse.json({ success: true, token: invite.token, role, expiresAt: invite.expiresAt });
  } catch (err) {
    return errorResponse(err, 'Error creating invite:');
  }
}

// DELETE /api/trips/[id]/invites?token=... - Revoke an invite link (owner)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tripId } = await params;
  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    await requireTripRole(db, tripId, userId, 'owner');

    const token = new URL(request.url).searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    await db.update(schema.tripInvites)
      .set({ revokedAt: Date.now() })
      .where(and(eq(schema.tripInvites.token, token), eq(schema.tripInvites.tripId, tripId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, 'Error revoking invite:');
  }
}

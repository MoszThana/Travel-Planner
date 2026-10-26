import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireUser, requireTripRole, tripIdForActivity, errorResponse } from '@/lib/access';
import { logEvent } from '@/lib/events';

export const runtime = 'edge';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

// GET /api/upload?tripId=... - List attachments for a trip (trip members)
export async function GET(request: Request) {
  try {
    const userId = await requireUser(request);
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get('tripId');
    if (!tripId) {
      return NextResponse.json({ error: 'Missing tripId parameter' }, { status: 400 });
    }

    const db = await getSafeDb();
    await requireTripRole(db, tripId, userId, 'viewer');

    const list = await db.select()
      .from(schema.attachments)
      .where(eq(schema.attachments.tripId, tripId))
      .orderBy(schema.attachments.createdAt);

    return NextResponse.json(list);
  } catch (err) {
    return errorResponse(err, 'Error listing attachments:');
  }
}

// POST /api/upload - Upload a file to R2 (trip editors)
export async function POST(request: Request) {
  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();

    // Reject oversized uploads before reading the body (form overhead allowance: 1 MB)
    const declaredBytes = Number(request.headers.get('content-length') || 0);
    if (declaredBytes > MAX_FILE_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: 'File is too large (max 20 MB).' }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const tripId = formData.get('tripId') as string;
    const activityId = formData.get('activityId') as string || null;

    if (!file || !tripId) {
      return NextResponse.json({ error: 'Missing file or tripId' }, { status: 400 });
    }
    await requireTripRole(db, tripId, userId, 'editor');

    if (activityId && (await tripIdForActivity(db, activityId)) !== tripId) {
      return NextResponse.json({ error: 'That activity belongs to a different trip.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File is too large (max 20 MB).' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();

    // Generate a unique, safe storage key/filename
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const storageKey = `${crypto.randomUUID()}-${sanitizedFilename}`;

    // Cloudflare R2 bucket from the Pages binding (local R2 under next dev via setupDevPlatform)
    const bucket = (getRequestContext().env as any).ATTACHMENTS_BUCKET;
    if (!bucket) {
      return NextResponse.json({ error: 'File storage (R2 binding "ATTACHMENTS_BUCKET") is not configured' }, { status: 500 });
    }

    await bucket.put(storageKey, arrayBuffer, {
      httpMetadata: { contentType: file.type }
    });

    const fileUrl = `/api/attachments/${storageKey}`;
    const attachmentId = crypto.randomUUID();

    await db.insert(schema.attachments).values({
      id: attachmentId,
      tripId,
      activityId,
      name: file.name,
      fileUrl,
      oneDriveItemId: storageKey, // holds the R2 storage key
      fileSize: file.size,
      mimeType: file.type,
      uploadedBy: userId,
      createdAt: Date.now()
    });

    await logEvent(db, tripId, userId, 'file.added', file.name);
    return NextResponse.json({
      success: true,
      attachmentId,
      name: file.name,
      fileUrl
    });
  } catch (err) {
    return errorResponse(err, 'R2 upload failed:');
  }
}

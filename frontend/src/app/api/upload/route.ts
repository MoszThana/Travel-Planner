import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// GET /api/upload?tripId=... - List attachments for a trip
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get('tripId');

  if (!tripId) {
    return NextResponse.json({ error: 'Missing tripId parameter' }, { status: 400 });
  }

  try {
    const db = await getSafeDb();

    const list = await db.select()
      .from(schema.attachments)
      .where(eq(schema.attachments.tripId, tripId))
      .orderBy(schema.attachments.createdAt);

    return NextResponse.json(list);
  } catch (err: any) {
    console.error('Error listing attachments:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/upload - Upload file to R2 or write to local uploads/ folder
export async function POST(request: Request) {
  try {
    const db = await getSafeDb();

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const tripId = formData.get('tripId') as string;
    const activityId = formData.get('activityId') as string || null;
    const uploadedBy = formData.get('uploadedBy') as string || 'user-maru';

    if (!file || !tripId) {
      return NextResponse.json({ error: 'Missing file or tripId' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    
    // Generate a unique, safe storage key/filename
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const storageKey = `${generateUUID()}-${sanitizedFilename}`;

    // Cloudflare R2 bucket from the Pages binding (local R2 under next dev via setupDevPlatform)
    const bucket = (getRequestContext().env as any).ATTACHMENTS_BUCKET;
    if (!bucket) {
      return NextResponse.json({ error: 'File storage (R2 binding "ATTACHMENTS_BUCKET") is not configured' }, { status: 500 });
    }

    await bucket.put(storageKey, arrayBuffer, {
      httpMetadata: { contentType: file.type }
    });

    const fileUrl = `/api/attachments/${storageKey}`;
    const attachmentId = generateUUID();

    // Insert attachment record into database
    await db.insert(schema.attachments).values({
      id: attachmentId,
      tripId,
      activityId,
      name: file.name,
      fileUrl,
      oneDriveItemId: storageKey, // We repurpose this string field to hold R2 storage key / filename
      fileSize: file.size,
      mimeType: file.type,
      uploadedBy,
      createdAt: Date.now()
    });

    return NextResponse.json({
      success: true,
      attachmentId,
      name: file.name,
      fileUrl
    });
  } catch (err: any) {
    console.error('R2 / Local upload api handler failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


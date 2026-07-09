import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

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

    // 1. Try to fetch R2 bucket binding via OpenNext Cloudflare context
    let bucket: any = null;
    try {
      const { getCloudflareContext } = await import('@opennextjs/cloudflare');
      const ctx = await getCloudflareContext({ async: true });
      if (ctx && ctx.env && ctx.env.ATTACHMENTS_BUCKET) {
        bucket = ctx.env.ATTACHMENTS_BUCKET;
      }
    } catch (e) {
      // Standard Node.js local dev environment
    }

    if (bucket) {
      console.log(`Uploading file ${file.name} to Cloudflare R2...`);
      await bucket.put(storageKey, arrayBuffer, {
        httpMetadata: { contentType: file.type }
      });
      console.log(`Cloudflare R2 upload successful. Key: ${storageKey}`);
    } else {
      // 2. Fallback to local file system writing
      console.log(`No R2 bucket found. Writing file ${file.name} to local uploads/ directory...`);
      const fs = eval("require('fs')");
      const path = eval("require('path')");
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const filePath = path.join(uploadsDir, storageKey);
      fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
      console.log(`Local file write successful: ${filePath}`);
    }

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


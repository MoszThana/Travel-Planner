
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq, and } from 'drizzle-orm';
import { uploadFileToOneDrive } from '@/utils/onedriveHelper';

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
    
    const db = getSafeDb();

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

// POST /api/upload - Upload file to OneDrive and save details in D1
export async function POST(request: Request) {
  try {
    
    const db = getSafeDb();

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const tripId = formData.get('tripId') as string;
    const activityId = formData.get('activityId') as string || null;
    const uploadedBy = formData.get('uploadedBy') as string || 'user-maru';

    if (!file || !tripId) {
      return NextResponse.json({ error: 'Missing file or tripId' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    
    // Upload to OneDrive using our helper
    console.log(`Uploading file ${file.name} to OneDrive...`);
    const uploadResult = await uploadFileToOneDrive(db, file.name, arrayBuffer, file.type);
    console.log(`OneDrive upload successful. Item ID: ${uploadResult.id}`);

    // Insert attachment record into database
    const attachmentId = generateUUID();
    await db.insert(schema.attachments).values({
      id: attachmentId,
      tripId,
      activityId,
      name: file.name,
      fileUrl: uploadResult.webUrl,
      oneDriveItemId: uploadResult.id,
      fileSize: file.size,
      mimeType: file.type,
      uploadedBy,
      createdAt: Date.now()
    });

    return NextResponse.json({
      success: true,
      attachmentId,
      name: file.name,
      fileUrl: uploadResult.webUrl
    });
  } catch (err: any) {
    console.error('OneDrive upload api handler failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


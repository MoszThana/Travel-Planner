import { NextResponse } from 'next/server';
export const runtime = 'edge';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;

  // 1. Try to get R2 bucket binding context from Cloudflare
  let bucket: any = null;
  try {
    const { getRequestContext } = eval('require')('@cloudflare/next-on-pages');
    const context = getRequestContext();
    if (context && context.env && context.env.ATTACHMENTS_BUCKET) {
      bucket = context.env.ATTACHMENTS_BUCKET;
    }
  } catch (e) {
    // Standard Node.js local dev environment
  }

  if (bucket) {
    try {
      const object = await bucket.get(key);
      if (!object) {
        return new Response('Attachment not found', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');

      return new Response(object.body, {
        headers,
      });
    } catch (err: any) {
      console.error('R2 retrieval error:', err);
      return new Response('Error retrieving file from R2', { status: 500 });
    }
  }

  // 2. Fallback to local filesystem for standard local development
  try {
    const fs = eval("require('fs')");
    const path = eval("require('path')");
    const filePath = path.join(process.cwd(), 'uploads', key);
    if (!fs.existsSync(filePath)) {
      return new Response('Attachment not found', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    // Basic MIME type lookup based on file extension
    let contentType = 'application/octet-stream';
    const lowerKey = key.toLowerCase();
    if (lowerKey.endsWith('.pdf')) {
      contentType = 'application/pdf';
    } else if (lowerKey.endsWith('.jpg') || lowerKey.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (lowerKey.endsWith('.png')) {
      contentType = 'image/png';
    } else if (lowerKey.endsWith('.webp')) {
      contentType = 'image/webp';
    } else if (lowerKey.endsWith('.gif')) {
      contentType = 'image/gif';
    }

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    console.error('Local file retrieval error:', err);
    return new Response('Error retrieving local file', { status: 500 });
  }
}

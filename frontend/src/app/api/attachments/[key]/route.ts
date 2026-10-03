import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

// GET /api/attachments/[key] - Stream a file from the R2 bucket
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;

  const bucket = (getRequestContext().env as any).ATTACHMENTS_BUCKET;
  if (!bucket) {
    return new Response('File storage (R2 binding "ATTACHMENTS_BUCKET") is not configured', { status: 500 });
  }

  try {
    const object = await bucket.get(key);
    if (!object) {
      return new Response('Attachment not found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(object.body, { headers });
  } catch (err: any) {
    console.error('R2 retrieval error:', err);
    return new Response('Error retrieving file from R2', { status: 500 });
  }
}

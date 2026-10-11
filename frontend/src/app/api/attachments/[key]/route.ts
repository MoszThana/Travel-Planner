import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSafeDb } from '@/db';
import { requireUser, requireTripRole, tripIdForAttachmentKey, errorResponse } from '@/lib/access';

export const runtime = 'edge';

// GET /api/attachments/[key] - Stream a file from R2 (trip members only)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;

  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    await requireTripRole(db, await tripIdForAttachmentKey(db, key), userId, 'viewer');

    const bucket = (getRequestContext().env as any).ATTACHMENTS_BUCKET;
    if (!bucket) {
      return new Response('File storage (R2 binding "ATTACHMENTS_BUCKET") is not configured', { status: 500 });
    }

    const object = await bucket.get(key);
    if (!object) {
      return new Response('Attachment not found', { status: 404 });
    }

    // Set headers directly: writeHttpMetadata() can't cross the local dev proxy
    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('etag', object.httpEtag);
    // Private: only this browser may cache it, since access depends on the login
    headers.set('Cache-Control', 'private, max-age=3600');

    return new Response(object.body, { headers });
  } catch (err) {
    return errorResponse(err, 'R2 retrieval error:');
  }
}

import { NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/access';
import { findMapsUrl, resolveMapsLink } from '@/lib/googleMapsLink';

export const runtime = 'edge';

// POST /api/places/google-link { text } - Read the place out of a pasted Google Maps link
export async function POST(request: Request) {
  try {
    await requireUser(request);
    const body = await request.json() as any;
    const text = String(body.text || '').slice(0, 2000);

    const url = findMapsUrl(text);
    if (!url) {
      return NextResponse.json({ error: 'That is not a Google Maps link.', code: 'not_maps_link' }, { status: 400 });
    }

    const place = await resolveMapsLink(url);
    if (!place) {
      return NextResponse.json({ error: 'Could not read a place from that link.', code: 'link_unreadable' }, { status: 422 });
    }
    return NextResponse.json(place);
  } catch (err) {
    return errorResponse(err, 'Error reading Google Maps link:');
  }
}

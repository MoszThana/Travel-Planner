import { NextResponse } from 'next/server';
import { queryGemini, isAiConfigured } from '@/utils/aiHelper';
import { requireUser, errorResponse } from '@/lib/access';

export const runtime = 'edge';

// POST /api/ai/recommend - Nearby recommendations (only when Gemini is set up)
export async function POST(request: Request) {
  try {
    await requireUser(request);
    if (!isAiConfigured()) {
      return NextResponse.json({ error: 'AI is not set up.' }, { status: 503 });
    }

    const body = await request.json() as any;
    const { destination, activityName } = body;

    const prompt = `Recommend 4 real places to visit (cafes, photo spots, landmarks, food) near "${activityName}" in "${destination}".
Return a JSON array of objects with keys "name", "category" and "reason" (one short sentence). Example:
[{ "name": "Cozy Café", "category": "cafe", "reason": "Famous for drip coffee." }]`;

    const results = await queryGemini(prompt);
    return NextResponse.json(Array.isArray(results) ? results : []);
  } catch (err: any) {
    if (err?.isAiUnavailable) return NextResponse.json({ error: err.message }, { status: 503 });
    return errorResponse(err, 'Error in recommend API:');
  }
}

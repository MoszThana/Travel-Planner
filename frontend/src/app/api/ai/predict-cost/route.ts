import { NextResponse } from 'next/server';
import { queryGemini, isAiConfigured } from '@/utils/aiHelper';
import { requireUser, errorResponse } from '@/lib/access';

export const runtime = 'edge';

// POST /api/ai/predict-cost - Estimated cost range for an activity (only when Gemini is set up)
export async function POST(request: Request) {
  try {
    await requireUser(request);
    if (!isAiConfigured()) {
      return NextResponse.json({ error: 'AI is not set up.' }, { status: 503 });
    }

    const body = await request.json() as any;
    const { activityName, category, destination, currency } = body;

    const prompt = `Estimate the typical cost range for one person visiting "${activityName}" (category: ${category}) in "${destination}". Include tickets, average meals, or transport if applicable.
Answer in ${currency || 'the local currency'}. Return a JSON object with keys "currency", "minPrice", "maxPrice" (numbers) and "explanation" (one short sentence).`;

    const result = await queryGemini(prompt);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err?.isAiUnavailable) return NextResponse.json({ error: err.message }, { status: 503 });
    return errorResponse(err, 'Error in predict-cost API:');
  }
}

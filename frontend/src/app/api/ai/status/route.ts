import { NextResponse } from 'next/server';
import { isAiConfigured } from '@/utils/aiHelper';
import { requireUser, errorResponse } from '@/lib/access';

export const runtime = 'edge';

// GET /api/ai/status - Whether AI features should be shown (GEMINI_API_KEY is set)
export async function GET(request: Request) {
  try {
    await requireUser(request);
    return NextResponse.json({ enabled: isAiConfigured() });
  } catch (err) {
    return errorResponse(err, 'Error reading AI status:');
  }
}

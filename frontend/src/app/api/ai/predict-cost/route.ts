import { NextResponse } from 'next/server';
import { queryGemini } from '@/utils/aiHelper';

// POST /api/ai/predict-cost - Predict cost range of activities
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { activityName, category, destination } = body;

    const prompt = `Predict the estimated cost range in local currency for visiting "${activityName}" (category: ${category}) in "${destination}". Include tickets, average meals, or transport if applicable.
Return ONLY a JSON object. Example:
{
  "currency": "USD",
  "minPrice": 15,
  "maxPrice": 45,
  "explanation": "Entry ticket is $15. Budget $30 for a meal or guide fee."
}`;

    const mockPrediction = {
      currency: destination.toLowerCase().includes('thailand') || destination.toLowerCase().includes('bangkok') ? 'THB' : 'USD',
      minPrice: category === 'hotel' ? 1200 : category === 'food' ? 150 : category === 'transport' ? 80 : 250,
      maxPrice: category === 'hotel' ? 3500 : category === 'food' ? 450 : category === 'transport' ? 250 : 700,
      explanation: `Predicted based on average tourist costs in ${destination} for ${category} activities.`
    };

    const results = await queryGemini(prompt, mockPrediction);
    return NextResponse.json(results);
  } catch (err: any) {
    console.error('Error in predict-cost AI API:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


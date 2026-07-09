import { NextResponse } from 'next/server';
import { queryGemini } from '@/utils/aiHelper';

// POST /api/ai/recommend - Nearby recommendations based on active location and weather
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { destination, activityName, weather } = body;

    const prompt = `Recommend 4 places to visit (cafes, photo spots, landmarks, food) near "${activityName}" in "${destination}". The weather is currently "${weather}". 
Return ONLY a JSON array. Example:
[
  { "name": "Cozy Café", "category": "cafe", "reason": "Famous for drip coffee and quiet workspace." },
  { "name": "Sunset Viewpoint", "category": "landmark", "reason": "Excellent panoramic sunset photo spot." }
]`;

    const mockRecommendations = [
      { name: `Local Thai Diner near ${activityName}`, category: 'food', reason: 'Authentic local dining spot within walking distance.' },
      { name: `Scenic Photo Spot`, category: 'landmark', reason: 'Iconic local photography location suitable for current weather.' },
      { name: `Central Cafe & Rest`, category: 'cafe', reason: 'Highly rated coffee stop to rest after visiting.' },
      { name: `Convenience Store / Pharmacy`, category: 'other', reason: 'Quick rest-stop for travel necessities.' }
    ];

    const results = await queryGemini(prompt, mockRecommendations);
    return NextResponse.json(results);
  } catch (err: any) {
    console.error('Error in recommend AI API:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


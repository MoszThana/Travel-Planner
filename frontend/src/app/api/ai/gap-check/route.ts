import { NextResponse } from 'next/server';
import { queryGemini } from '@/utils/aiHelper';

export const runtime = 'edge';

// POST /api/ai/gap-check - Schedule Gap Detection
export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    const { activities } = body;
    
    if (!activities || !Array.isArray(activities)) {
      return NextResponse.json({ error: 'Missing activities array' }, { status: 400 });
    }

    const prompt = `Analyze this travel itinerary for structural issues. 
Look for:
1. Overlapping times (activities at the same time).
2. Gaps larger than 4 hours during active hours (09:00 - 21:00).
3. Unrealistic travel times (e.g., flight to car trip within 30 mins).
4. Missing meal breaks (no activities near 12:00 or 18:00).

Itinerary: ${JSON.stringify(activities.map(a => ({ name: a.name, time: a.time, transport: a.transportType })))}

Return ONLY a JSON array of issues. Example format:
[
  { "type": "Meal Skip", "message": "No lunch break scheduled around 12:00." },
  { "type": "Tight Schedule", "message": "Only 10 minutes allocated to travel between A and B." }
]`;

    // Rule-based simulation fallback
    const mockIssues: any[] = [];
    
    // Sort activities by time
    const sorted = [...activities].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    
    // Rule 1: Meal checks
    const times = sorted.map(a => a.time || '');
    const hasLunch = times.some(t => {
      const hr = parseInt(t.split(':')[0]);
      return hr >= 11 && hr <= 14;
    });
    if (sorted.length > 0 && !hasLunch) {
      mockIssues.push({ type: 'Meal Skip', message: 'No lunch break scheduled between 11:00 AM and 2:00 PM.' });
    }

    // Rule 2: Travel checks
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur.time && next.time) {
        const curHr = parseInt(cur.time.split(':')[0]);
        const curMin = parseInt(cur.time.split(':')[1]);
        const nextHr = parseInt(next.time.split(':')[0]);
        const nextMin = parseInt(next.time.split(':')[1]);

        const diffMin = (nextHr * 60 + nextMin) - (curHr * 60 + curMin);
        if (diffMin > 0 && diffMin < 45 && cur.transportType === 'flight') {
          mockIssues.push({ type: 'Unrealistic Travel Time', message: `Only ${diffMin} minutes between arriving at flight and ${next.name}.` });
        } else if (diffMin === 0) {
          mockIssues.push({ type: 'Overlapping Activities', message: `${cur.name} and ${next.name} are scheduled at the exact same time.` });
        }
      }
    }

    const results = await queryGemini(prompt, mockIssues);
    return NextResponse.json(results);
  } catch (err: any) {
    console.error('Error in gap-check AI API:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


import { NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/access';

export const runtime = 'edge';

const toMinutes = (time?: string | null): number | null => {
  const match = /^(\d{1,2}):(\d{2})/.exec(time || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

// POST /api/ai/gap-check - Rule-based schedule checks for one day (no AI involved)
export async function POST(request: Request) {
  try {
    await requireUser(request);
    const body = await request.json() as any;
    const { activities } = body;

    if (!activities || !Array.isArray(activities)) {
      return NextResponse.json({ error: 'Missing activities array' }, { status: 400 });
    }

    const issues: { type: string; message: string }[] = [];
    const timed = activities
      .map((a: any) => ({ ...a, minutes: toMinutes(a.time) }))
      .filter((a: any) => a.minutes !== null)
      .sort((a: any, b: any) => a.minutes - b.minutes);

    // Missing lunch: only when the day actually runs through lunchtime
    if (timed.length >= 2) {
      const first = timed[0].minutes;
      const last = timed[timed.length - 1].minutes;
      const hasLunch = timed.some((a: any) => a.minutes >= 11 * 60 && a.minutes <= 14 * 60);
      if (first < 11 * 60 && last > 14 * 60 && !hasLunch) {
        issues.push({ type: 'Meal Skip', message: 'Nothing is planned between 11:00 and 14:00 — leave time for lunch.' });
      }
    }

    for (let i = 0; i < timed.length - 1; i++) {
      const cur = timed[i];
      const next = timed[i + 1];
      const gap = next.minutes - cur.minutes;
      if (gap === 0) {
        issues.push({ type: 'Overlapping Activities', message: `${cur.name} and ${next.name} are both at ${cur.time}.` });
      } else if (gap < 45 && cur.transportType === 'flight') {
        issues.push({ type: 'Tight Schedule', message: `Only ${gap} minutes between ${cur.name} (flight) and ${next.name}.` });
      }
    }

    return NextResponse.json(issues);
  } catch (err) {
    return errorResponse(err, 'Error in gap-check API:');
  }
}

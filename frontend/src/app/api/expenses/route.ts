import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { requireUser, requireTripRole, errorResponse } from '@/lib/access';
import { logEvent } from '@/lib/events';

export const runtime = 'edge';

// POST /api/expenses - Add group expense and splits (trip editors)
export async function POST(request: Request) {
  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();

    const body = await request.json() as any;
    const { tripId, payerId, amount, description, category, splitType, splits } = body;

    if (!tripId || !payerId || !amount || !description || !splits || !Array.isArray(splits) || splits.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    await requireTripRole(db, tripId, userId, 'editor');

    // The payer and everyone sharing the cost must be on this trip
    const memberRows = await db.select({ userId: schema.tripMembers.userId })
      .from(schema.tripMembers)
      .where(eq(schema.tripMembers.tripId, tripId));
    const members = new Set(memberRows.map((m: { userId: string }) => m.userId));
    if (!members.has(payerId) || splits.some((s: any) => !members.has(s.userId))) {
      return NextResponse.json({ error: 'Payer and people sharing the cost must be trip members.' }, { status: 400 });
    }

    const expenseId = crypto.randomUUID();

    // Insert the expense and its splits atomically. Cloudflare D1 rejects BEGIN TRANSACTION, so use batch()
    await db.batch([
      db.insert(schema.groupExpenses).values({
        id: expenseId,
        tripId,
        payerId,
        amount: parseFloat(amount),
        description,
        category: category || 'other',
        splitType: splitType || 'equal',
        createdAt: Date.now()
      }),
      ...splits.map((s: any) =>
        db.insert(schema.expenseSplits).values({
          id: crypto.randomUUID(),
          expenseId,
          userId: s.userId,
          amount: parseFloat(s.amount)
        })
      )
    ]);

    await logEvent(db, tripId, userId, 'expense.added', `${description} · ${parseFloat(amount).toLocaleString('en-US')}`);
    return NextResponse.json({ success: true, expenseId });
  } catch (err) {
    return errorResponse(err, 'Error adding expense:');
  }
}

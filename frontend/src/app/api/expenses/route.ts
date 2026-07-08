
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';

export const runtime = 'edge';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// POST /api/expenses - Add group expense and splits
export async function POST(request: Request) {
  try {
    
    const db = getSafeDb();

    const body = await request.json() as any;
    const { tripId, payerId, amount, description, category, splitType, splits } = body;
    
    if (!tripId || !payerId || !amount || !description || !splits || !Array.isArray(splits)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const expenseId = generateUUID();

    await db.transaction(async (tx: any) => {
      // 1. Insert Group Expense
      await tx.insert(schema.groupExpenses).values({
        id: expenseId,
        tripId,
        payerId,
        amount: parseFloat(amount),
        description,
        category: category || 'other',
        splitType: splitType || 'equal',
        createdAt: Date.now()
      });

      // 2. Insert individual splits
      for (const s of splits) {
        await tx.insert(schema.expenseSplits).values({
          id: generateUUID(),
          expenseId,
          userId: s.userId,
          amount: parseFloat(s.amount)
        });
      }
    });

    return NextResponse.json({ success: true, expenseId });
  } catch (err: any) {
    console.error('Error adding expense:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


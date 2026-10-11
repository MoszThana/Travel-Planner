import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { requireUser, requireTripRole, tripIdForExpense, errorResponse } from '@/lib/access';

export const runtime = 'edge';

// DELETE /api/expenses/[id] - Delete expense and its splits (trip editors)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const userId = await requireUser(request);
    const db = await getSafeDb();
    await requireTripRole(db, await tripIdForExpense(db, id), userId, 'editor');

    // Delete splits then the expense atomically. Cloudflare D1 rejects BEGIN TRANSACTION, so use batch()
    await db.batch([
      db.delete(schema.expenseSplits).where(eq(schema.expenseSplits.expenseId, id)),
      db.delete(schema.groupExpenses).where(eq(schema.groupExpenses.id, id))
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, `Error deleting expense ${id}:`);
  }
}

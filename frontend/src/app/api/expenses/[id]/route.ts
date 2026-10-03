
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

// DELETE /api/expenses/[id] - Delete expense and its splits
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    
    const db = await getSafeDb();

    // Delete splits then the expense atomically. Cloudflare D1 rejects BEGIN TRANSACTION, so use batch()
    await db.batch([
      db.delete(schema.expenseSplits).where(eq(schema.expenseSplits.expenseId, id)),
      db.delete(schema.groupExpenses).where(eq(schema.groupExpenses.id, id))
    ]);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`Error deleting expense ${id}:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

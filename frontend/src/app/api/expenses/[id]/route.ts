
import { NextResponse } from 'next/server';
import { getSafeDb, schema } from '@/db';
import { eq } from 'drizzle-orm';

// DELETE /api/expenses/[id] - Delete expense and its splits
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    
    const db = await getSafeDb();

    await db.transaction(async (tx: any) => {
      await tx.delete(schema.expenseSplits).where(eq(schema.expenseSplits.expenseId, id));
      await tx.delete(schema.groupExpenses).where(eq(schema.groupExpenses.id, id));
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`Error deleting expense ${id}:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

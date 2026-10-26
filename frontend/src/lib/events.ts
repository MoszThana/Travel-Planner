import { schema } from '@/db';

// "What's new" log. Each entry is a short, already-human summary so the app can
// show it without extra lookups: "{user} {type-verb} {summary}".
export type TripEventType =
  | 'activity.added'
  | 'activity.edited'
  | 'activity.deleted'
  | 'activity.reordered'
  | 'activity.checked_in'
  | 'day.added'
  | 'expense.added'
  | 'expense.deleted'
  | 'settlement.added'
  | 'contact.added'
  | 'contact.deleted'
  | 'file.added'
  | 'file.deleted'
  | 'member.joined'
  | 'member.added'
  | 'member.removed'
  | 'member.role_changed'
  | 'trip.edited';

/** Record an event. Never throws: a failed log must not fail the user's action. */
export async function logEvent(db: any, tripId: string, userId: string, type: TripEventType, summary: string) {
  try {
    await db.insert(schema.tripEvents).values({
      id: crypto.randomUUID(),
      tripId,
      userId,
      type,
      summary: summary.slice(0, 200),
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error('Failed to log trip event:', err);
  }
}

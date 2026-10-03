import { drizzle } from 'drizzle-orm/d1';
import { getRequestContext } from '@cloudflare/next-on-pages';
import * as schema from './schema';

// Cloudflare D1 via the Pages "DB" binding.
// Locally, next.config.ts runs setupDevPlatform() so `next dev` gets a local D1 from wrangler.toml.
export function getDb(env?: any) {
  const binding = env?.DB ?? (getRequestContext().env as any).DB;
  if (!binding) {
    throw new Error('D1 binding "DB" is not configured. Check wrangler.toml / the Pages project bindings.');
  }
  return drizzle(binding, { schema });
}

let seeded = false;

export async function getSafeDb() {
  const db = getDb();

  // Seed mock users once per worker instance to prevent Foreign Key failures during prototype testing
  if (!seeded) {
    seeded = true;
    try {
      const now = Date.now();
      await db.batch(
        [
          { id: 'user-maru', name: 'Maru', email: 'maru@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Maru', createdAt: now },
          { id: 'user-somchai', name: 'Somchai', email: 'somchai@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Somchai', createdAt: now },
          { id: 'user-jane', name: 'Jane', email: 'jane@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Jane', createdAt: now },
          { id: 'user-david', name: 'David', email: 'david@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=David', createdAt: now },
        ].map((u) => db.insert(schema.users).values(u).onConflictDoNothing()) as any
      );
    } catch (err) {
      // Ignore seeding errors (e.g. tables not migrated yet)
    }
  }

  return db;
}

export * as schema from './schema';
export { getDb as getRawDb };

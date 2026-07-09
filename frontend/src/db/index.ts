import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql/web';
import * as schema from './schema';

export function getDb(env?: any) {
  // 1. If env.DB is provided (pages.dev or wrangler local dev), use D1
  if (env && env.DB) {
    return drizzleD1(env.DB, { schema });
  }

  // 2. Fallback to standard LibSQL file-based SQLite for local "next dev" development
  const { createClient } = eval('require')('@libsql/client/node');
  const client = createClient({
    url: 'file:../backend/dev.db',
  });
  return drizzleLibsql(client, { schema }) as any;
}

export async function getSafeDb() {
  let env: any = null;
  try {
    // Use @opennextjs/cloudflare context (works in Cloudflare Pages edge runtime)
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const context = await getCloudflareContext({ async: true });
    if (context && context.env) {
      env = context.env;
    }
  } catch (e) {
    // Running in standard Node.js Next.js dev server - use local SQLite
  }
  const db = getDb(env);

  // Seed mock users to prevent Foreign Key constraint failures during prototype testing
  try {
    const mockUsers = [
      { id: 'user-maru', name: 'Maru', email: 'maru@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Maru', createdAt: Date.now() },
      { id: 'user-somchai', name: 'Somchai', email: 'somchai@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Somchai', createdAt: Date.now() },
      { id: 'user-jane', name: 'Jane', email: 'jane@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Jane', createdAt: Date.now() },
      { id: 'user-david', name: 'David', email: 'david@example.com', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=David', createdAt: Date.now() },
    ];
    for (const u of mockUsers) {
      await db.insert(schema.users).values(u).onConflictDoNothing();
    }
  } catch (err) {
    // Ignore seeding errors
  }

  return db;
}

export * as schema from './schema';
export { getDb as getRawDb };

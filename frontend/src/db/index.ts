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
  return getDb(env);
}

export * as schema from './schema';
export { getDb as getRawDb };

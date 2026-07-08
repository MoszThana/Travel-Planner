import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
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

export function getSafeDb() {
  let env: any = null;
  try {
    // Dynamically require to avoid compilation issues in non-edge routes if any
    const { getRequestContext } = eval('require')('@cloudflare/next-on-pages');
    const context = getRequestContext();
    if (context && context.env) {
      env = context.env;
    }
  } catch (e) {
    // Running in standard Node.js Next.js dev server
  }
  return getDb(env);
}

export * as schema from './schema';
export { getDb as getRawDb };

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

export async function getSafeDb() {
  return getDb();
}

export * as schema from './schema';
export { getDb as getRawDb };

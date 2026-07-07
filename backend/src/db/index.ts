import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema.js';

// Setup connection to the local file-based SQLite database
const client = createClient({
  url: 'file:dev.db',
});

export const db = drizzle(client, { schema });
export * as schema from './schema.js';

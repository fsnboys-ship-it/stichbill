import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { validateLocalDatabaseUrl } from '../config.js';
import { assertDatabaseSecurity } from './security.js';
// Access queries use explicit typed SQL. Business CRUD is a later increment.
export type Database = Record<string, never>;
export function createDatabase(url: string): Kysely<Database> {
  validateLocalDatabaseUrl(url);
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({
    connectionString: url, max: 5, connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10000, query_timeout: 2000, statement_timeout: 2000,
    application_name: 'stichbill-development',
  }) }) });
}
export async function probeDatabase(db: Kysely<Database>): Promise<void> {
  await assertDatabaseSecurity(db, 'ready');
}

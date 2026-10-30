import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { validateLocalDatabaseUrl } from '../config.js';
// Deliberately empty: Task 002 has no business tables.
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
  await sql`select 1 as ready`.execute(db);
}

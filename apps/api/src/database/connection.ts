import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { validateLocalDatabaseUrl } from '../config.js';
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
  const { rows } = await sql<{safe: boolean}>`select current_user=current_database() || '_runtime'
    and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb
    and not exists(select 1 from pg_auth_members where member=pg_roles.oid)
    and not exists(select 1 from pg_class where relowner=pg_roles.oid and relnamespace='public'::regnamespace)
    and to_regprocedure('auth.resolve_context(text,uuid)') is not null as safe
    from pg_roles where rolname=current_user`.execute(db);
  if (!rows[0]?.safe) throw new Error('Runtime database role or schema is not ready');
}

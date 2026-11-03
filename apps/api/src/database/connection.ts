import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { validateDatabaseConnection, type AppConfig } from '../config.js';
import { assertDatabaseSecurity } from './security.js';
// Access queries use explicit typed SQL. Business CRUD is a later increment.
export type Database = Record<string, never>;
export function createDatabase(url: string, environment: AppConfig['APP_ENV'] = 'development', purpose: 'runtime' | 'migrator' | 'bootstrap' = 'runtime'): Kysely<Database> {
  validateDatabaseConnection(url, environment, purpose);
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({
    connectionString: url, max: 5, connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10000, query_timeout: 2000, statement_timeout: 2000,
    application_name: `stichbill-${environment}`,
  }) }) });
}
export async function probeDatabase(db: Kysely<Database>): Promise<void> {
  await assertDatabaseSecurity(db, 'ready');
}

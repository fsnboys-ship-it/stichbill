import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sql } from 'kysely';
import { type Migration, type MigrationProvider } from 'kysely/migration';
import type { Kysely } from 'kysely';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { validateLocalDatabaseUrl } from '../config.js';
import { createDatabase, type Database } from './connection.js';
export class SqlMigrationProvider implements MigrationProvider {
  constructor(private readonly directory: string) {}
  async getMigrations(): Promise<Record<string, Migration>> {
    const names = (await readdir(this.directory)).filter(n => n.endsWith('.sql')).sort();
    const migrations: Record<string, Migration> = {};
    for (const name of names) {
      if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(name)) throw new Error('Migration names must use YYYYMMDDHHMMSS_description.sql');
      const content = await readFile(resolve(this.directory, name), 'utf8');
      migrations[name] = { up: async db => { await sql.raw(content).execute(db); } };
    }
    return migrations;
  }
}
export async function applyMigrations(db: Kysely<Database>, directory: string): Promise<void> {
  const migrations = await new SqlMigrationProvider(directory).getMigrations();
  await db.transaction().execute(async trx => {
    await sql`select pg_advisory_xact_lock(731003, 2)`.execute(trx);
    const { rows } = await sql<{ safe: boolean }>`select current_user = current_database() || '_migrator'
      and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb as safe
      from pg_roles where rolname=current_user`.execute(trx);
    if (!rows[0]?.safe) throw new Error('Use the dedicated non-superuser migrator role');
    await sql`create table if not exists public.migration_history (
      version text primary key, checksum text not null, applied_at timestamptz not null default now())`.execute(trx);
    const applied = await sql<{version: string; checksum: string}>`select version,checksum from public.migration_history order by version`.execute(trx);
    for (const old of applied.rows) if (!migrations[old.version]) throw new Error('Applied migration file missing');
    for (const name of Object.keys(migrations)) {
      const content = await readFile(resolve(directory, name), 'utf8');
      const checksum = createHash('sha256').update(content).digest('hex');
      const previous = applied.rows.find(row => row.version === name);
      if (previous && previous.checksum !== checksum) throw new Error('Applied migration checksum changed');
      if (previous) continue;
      if (applied.rows.some(row => row.version > name)) throw new Error('Out-of-order migration rejected');
      await sql.raw(content).execute(trx);
      await sql`insert into public.migration_history(version,checksum) values (${name},${checksum})`.execute(trx);
    }
  });
}
async function main() {
  if (process.env.ALLOW_MIGRATIONS !== 'true' || !process.argv.includes('--approve-local-migrations')) {
    throw new Error('Migration execution requires ALLOW_MIGRATIONS=true and --approve-local-migrations for reviewed local/test schema only.');
  }
  const url = validateLocalDatabaseUrl(process.env.MIGRATION_DATABASE_URL ?? '');
  const db = createDatabase(url);
  try {
    await applyMigrations(db, resolve('database/migrations'));
    console.log('Reviewed local migrations completed.');
  } finally { await db.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => { console.error('Migration failed. Check local configuration, migration integrity and role separation. No credentials are logged.'); process.exitCode = 1; });

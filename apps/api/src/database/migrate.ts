import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sql } from 'kysely';
import { type Migration, type MigrationProvider } from 'kysely/migration';
import type { Kysely } from 'kysely';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import {migrationSource,sha256} from './bootstrap.js';
import {inspectSecurity as inspectCurrent,validateSecurity as validateCurrent} from './security.js';
import {inspectSecurity as inspectLegacy,validateSecurity as validateLegacy} from './legacy-security.js';
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
    await sql`alter table public.migration_history add column if not exists execution_checksum text, add column if not exists execution_mode text`.execute(trx);
    const namespace=(await sql<{present:boolean}>`select to_regnamespace('stich_auth') is not null as present`.execute(trx)).rows[0]!.present;
    const applied = await sql<{version: string; checksum: string; execution_checksum:string|null; execution_mode:string|null}>`select version,checksum,execution_checksum,execution_mode from public.migration_history order by version`.execute(trx);
    for (const old of applied.rows) if (!migrations[old.version]) throw new Error('Applied migration file missing');
    const namespaced=namespace || applied.rows.length===0;
    for (const name of Object.keys(migrations)) {
      const content = await readFile(resolve(directory, name), 'utf8');
      const checksum = createHash('sha256').update(content).digest('hex');
      const previous = applied.rows.find(row => row.version === name);
      if (previous && previous.checksum !== checksum) throw new Error('Applied migration checksum changed');
      if(previous){
        if((previous.execution_mode===null)!==(previous.execution_checksum===null))throw new Error('Incomplete execution provenance');
        if(previous.execution_mode!==null && !['original','stich_auth_v1'].includes(previous.execution_mode))throw new Error('Unknown execution provenance');
      }
      const executable=await migrationSource(name,content,previous?previous.execution_mode==='stich_auth_v1':namespaced);
      if(previous){
        if(previous.execution_checksum!==null && previous.execution_checksum!==sha256(executable.sql))throw new Error('Applied execution checksum changed');
        continue;
      }
      if (applied.rows.some(row => row.version > name)) throw new Error('Out-of-order migration rejected');
      if(name==='20261104000100_stich_auth_namespace.sql' && applied.rows.length>0){
        await sql`set local search_path=pg_catalog`.execute(trx);
        if(namespace)validateCurrent(await inspectCurrent(trx),'provision');
        else validateLegacy(await inspectLegacy(trx),'provision');
      }
      await sql.raw(executable.sql).execute(trx);
      await sql`insert into public.migration_history(version,checksum,execution_checksum,execution_mode) values (${name},${checksum},${sha256(executable.sql)},${executable.mode})`.execute(trx);
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

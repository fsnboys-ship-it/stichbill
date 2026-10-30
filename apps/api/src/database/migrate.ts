import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sql } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import { pathToFileURL } from 'node:url';
import { readConfig } from '../config.js';
import { createDatabase } from './connection.js';
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
async function main() {
  const config = readConfig();
  if (config.ALLOW_MIGRATIONS !== 'true' || !process.argv.includes('--approve-local-migrations')) {
    throw new Error('Migration execution requires reviewed approval, ALLOW_MIGRATIONS=true and --approve-local-migrations. Not authorised in Task 002.');
  }
  const provider = new SqlMigrationProvider(resolve('database/migrations'));
  if (Object.keys(await provider.getMigrations()).length === 0) { console.log('No SQL migrations; database untouched.'); return; }
  const db = createDatabase(config.DATABASE_URL);
  try {
    const result = await new Migrator({ db, provider }).migrateToLatest();
    if (result.error) throw new Error('Migration failed; inspect locally and use the reviewed recovery plan.');
    console.log('Reviewed local migrations completed.');
  } finally { await db.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error instanceof Error ? error.message : 'Migration failed'); process.exitCode = 1; });

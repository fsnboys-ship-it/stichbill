import pg from 'pg';
import { access, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { validateLocalDatabaseUrl } from '../apps/api/dist/config.js';
const admin = new URL(validateLocalDatabaseUrl(process.env.ADMIN_DATABASE_URL ?? ''));
if (admin.pathname !== '/stichbill_dev') throw new Error('Use the dedicated local development admin to provision the isolated test DB.');
const client = new pg.Client({connectionString:admin.href});
await client.connect();
try {
  const {rowCount}=await client.query("select 1 from pg_database where datname='stichbill_test'");
  if (!rowCount) await client.query('CREATE DATABASE stichbill_test');
} finally {await client.end();}
admin.pathname='/stichbill_test';
let existing = false;
try {await access('.env.test'); existing=true;} catch(error) {if(error.code!=='ENOENT') throw error;}
if (!existing) {
  const runtime=new URL(admin), migrator=new URL(admin);
  runtime.username='stichbill_test_runtime'; runtime.password=randomBytes(24).toString('hex');
  migrator.username='stichbill_test_migrator'; migrator.password=randomBytes(24).toString('hex');
  await writeFile('.env.test.db',`ADMIN_DATABASE_URL=${admin.href}\nMIGRATION_DATABASE_URL=${migrator.href}\n`,{flag:'wx',mode:0o600});
  await writeFile('.env.test',`APP_ENV=test\nDATABASE_URL=${runtime.href}\n`,{flag:'wx',mode:0o600});
}
const testRuntime=parseEnv(await readFile('.env.test','utf8'));
const testAdmin=parseEnv(await readFile('.env.test.db','utf8'));
if (new URL(testRuntime.DATABASE_URL).pathname!=='/stichbill_test' || new URL(testAdmin.ADMIN_DATABASE_URL).href!==admin.href) throw new Error('Existing test files target a different database or admin; preserved for manual review.');
const result=spawnSync(process.execPath,['scripts/provision-local-db.mjs'],{stdio:'inherit',env:{...process.env,...testRuntime,...testAdmin}});
if(result.error) throw result.error;
process.exitCode=result.status ?? 1;

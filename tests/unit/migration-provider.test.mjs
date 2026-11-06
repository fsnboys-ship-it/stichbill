import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Kysely, PostgresDialect } from 'kysely';
import { applyMigrations, SqlMigrationProvider } from '../../apps/api/dist/database/migrate.js';
import { sha256 } from '../../apps/api/dist/database/bootstrap.js';
import { bootstrapManifest } from '../../apps/api/dist/database/bootstrap-manifest.js';
test('reviewed access migration is discoverable; provider only inspects files', async () => {
  assert.deepEqual(Object.keys(await new SqlMigrationProvider(resolve('database/migrations')).getMigrations()), ['20261031000100_access_foundation.sql', '20261031000300_function_defaults.sql', '20261103000100_owner_authentication.sql', '20261103000200_organisation_access.sql', '20261103000300_product_catalogue.sql', '20261104000100_stich_auth_namespace.sql']);
});
test('provider orders reviewed names and rejects ambiguous naming; no SQL executes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stich-migration-test-'));
  try {
    await writeFile(join(directory, '20261030000100_second.sql'), '-- fixture only');
    await writeFile(join(directory, '20261030000000_first.sql'), '-- fixture only');
    const provider = new SqlMigrationProvider(directory);
    assert.deepEqual(Object.keys(await provider.getMigrations()), ['20261030000000_first.sql', '20261030000100_second.sql']);
    await writeFile(join(directory, 'bad.sql'), '-- fixture only');
    await assert.rejects(() => provider.getMigrations(), /Migration names/);
  } finally { await rm(directory, { recursive: true }); }
});

const historical = bootstrapManifest['20261031000100_access_foundation.sql'];
for(const [label,mode,checksum,error] of [
  ['historical NULL pair',null,null,null],
  ['valid original provenance','original',historical.source,null],
  ['valid bootstrap provenance','stich_auth_v1',historical.execution,null],
  ['mode without checksum','stich_auth_v1',null,/Incomplete execution provenance/],
  ['checksum without mode',null,historical.source,/Incomplete execution provenance/],
  ['unknown mode','invalid',historical.source,/Unknown execution provenance/],
  ['empty mode','',historical.source,/Unknown execution provenance/],
  ['wrong checksum','original','0'.repeat(64),/Applied execution checksum changed/],
  ['empty checksum','original','',/Applied execution checksum changed/],
  ['bootstrap mode with original checksum','stich_auth_v1',historical.source,/Applied execution checksum changed/],
])test(`migration provenance: ${label}`,async()=>{
  const directory=resolve('database/migrations');
  const migrations=await new SqlMigrationProvider(directory).getMigrations();
  const history=await Promise.all(Object.keys(migrations).map(async version=>({
    version,checksum:sha256(await readFile(join(directory,version),'utf8')),
    execution_mode:null,execution_checksum:null,
  })));
  history[0].execution_mode=mode;history[0].execution_checksum=checksum;
  const queries=[];
  // Exercise the real migration runner with a simulated PostgreSQL ledger; no database is contacted.
  const client={release(){},async query(statement){
    queries.push(statement);
    if(statement.startsWith('select current_user'))return {rows:[{safe:true}]};
    if(statement.startsWith('select to_regnamespace'))return {rows:[{present:true}]};
    if(statement.startsWith('select version,checksum'))return {rows:history};
    if(['begin','commit','rollback'].includes(statement) ||
       statement.startsWith('select pg_advisory_xact_lock') ||
       statement.startsWith('create table if not exists public.migration_history') ||
       statement.startsWith('alter table public.migration_history'))return {rows:[]};
    assert.fail('Unexpected SQL: '+statement);
  }};
  const db=new Kysely({dialect:new PostgresDialect({pool:{async connect(){return client;},async end(){}}})});
  try{
    if(error)await assert.rejects(()=>applyMigrations(db,directory),error);
    else await applyMigrations(db,directory);
    assert.equal(queries.at(-1),error?'rollback':'commit');
    assert.equal(queries.includes(error?'commit':'rollback'),false);
  }finally{await db.destroy();}
});

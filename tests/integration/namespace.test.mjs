import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';
import {sql} from 'kysely';
import {createDatabase,probeDatabase} from '../../apps/api/dist/database/connection.js';
import {inspectSecurity,validateSecurity} from '../../apps/api/dist/database/security.js';
import {applyMigrations} from '../../apps/api/dist/database/migrate.js';
import {bootstrapManifest} from '../../apps/api/dist/database/bootstrap-manifest.js';
import {provisionLocalDatabase} from '../../scripts/provision-local-db.mjs';
import {validateLocalDatabaseUrl} from '../../apps/api/dist/config.js';
const quote=s=>'"'+s.replaceAll('"','""')+'"';
async function fixture(work){
 const base=new URL(validateLocalDatabaseUrl(process.env.ADMIN_DATABASE_URL??''));assert.equal(base.pathname,'/stichbill_test');
 const name='stichbill_test_security_'+randomBytes(4).toString('hex'),a=new URL(base);a.pathname='/'+name;
 const r=new URL(a),m=new URL(a);r.username=name+'_runtime';m.username=name+'_migrator';r.password=randomBytes(24).toString('hex');m.password=randomBytes(24).toString('hex');
 const control=new pg.Client({connectionString:base.href});await control.connect();let admin,db,migrator,created=false;
 try{await control.query('CREATE DATABASE '+quote(name));created=true;admin=new pg.Client({connectionString:a.href});await admin.connect();
  await provisionLocalDatabase({ADMIN_DATABASE_URL:a.href,MIGRATION_DATABASE_URL:m.href,DATABASE_URL:r.href});db=createDatabase(r.href);migrator=createDatabase(m.href);
  return await work({admin,db,migrator,name,runtime:r.username,migration:m.username,owner:decodeURIComponent(base.username)});
 }finally{await Promise.all([admin?.end(),db?.destroy(),migrator?.destroy()]);if(created){await control.query('DROP DATABASE '+quote(name)+' WITH (FORCE)');for(const role of [r.username,m.username])await control.query('DROP ROLE IF EXISTS '+quote(role));}await control.end();}
}
const snapshot=db=>db.transaction().execute(async trx=>{await sql`set local search_path=pg_catalog`.execute(trx);return inspectSecurity(trx);});
const acl=(role,grantor,privileges)=>privileges.map(privilege=>({role,grantor,privilege,grantable:false}));
test('historical replay upgrades without changing table identity, data, function ACLs or source history',async()=>fixture(async({admin,db,migrator,migration})=>{
 await admin.query('SET ROLE '+quote(migration));
 await admin.query('CREATE TABLE public.migration_history(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 for(const[name,{source}]of Object.entries(bootstrapManifest)){await admin.query(await readFile('database/migrations/'+name,'utf8'));await admin.query('INSERT INTO public.migration_history(version,checksum) VALUES($1,$2)',[name,source]);}
 await admin.query("INSERT INTO auth.identity_accounts(id,normalised_email) VALUES('00000000-0000-4000-8000-000000000008','preserved@example.test')");
 const before=(await admin.query("SELECT 'auth.identity_accounts'::regclass::oid AS oid")).rows[0].oid;
 const grants=(await admin.query("SELECT proname,proowner,proacl::text FROM pg_proc WHERE pronamespace='auth'::regnamespace ORDER BY proname")).rows;
 await admin.query('RESET ROLE');
 // A transition cannot overwrite drift and bless it with the new function hashes.
 await admin.query('ALTER FUNCTION auth.is_owner(uuid) SET search_path=public,pg_catalog');
 await assert.rejects(()=>applyMigrations(migrator,resolve('database/migrations')),/Unsafe database configuration/);
 assert.equal((await admin.query("SELECT to_regnamespace('stich_auth') IS NULL AS absent")).rows[0].absent,true);
 await admin.query('ALTER FUNCTION auth.is_owner(uuid) SET search_path=pg_catalog');
 await applyMigrations(migrator,resolve('database/migrations'));await probeDatabase(db);
 assert.equal((await admin.query("SELECT 'stich_auth.identity_accounts'::regclass::oid AS oid")).rows[0].oid,before);
 assert.equal((await admin.query('SELECT count(*)::int AS n FROM stich_auth.identity_accounts')).rows[0].n,1);
 assert.deepEqual((await admin.query("SELECT proname,proowner,proacl::text FROM pg_proc WHERE pronamespace='stich_auth'::regnamespace ORDER BY proname")).rows,grants);
 for(const row of(await admin.query('SELECT version,checksum FROM public.migration_history')).rows)if(bootstrapManifest[row.version])assert.equal(row.checksum,bootstrapManifest[row.version].source);
 await applyMigrations(migrator,resolve('database/migrations'));await probeDatabase(db);
}));
test('fresh bootstrap is reproducible and never creates, renames or alters provider auth objects',async()=>{
 const results=[];
 for(let round=0;round<2;round++)await fixture(async({admin,db,migrator,name,runtime,migration,owner})=>{
  await admin.query('CREATE SCHEMA auth; REVOKE ALL ON SCHEMA auth FROM PUBLIC; CREATE TABLE auth.provider_fixture(id integer PRIMARY KEY); INSERT INTO auth.provider_fixture VALUES(8)');
  const original=(await admin.query("SELECT 'auth.provider_fixture'::regclass::oid AS oid")).rows[0].oid;
  await applyMigrations(migrator,resolve('database/migrations'));
  assert.equal((await admin.query("SELECT 'auth.provider_fixture'::regclass::oid AS oid")).rows[0].oid,original);
  assert.deepEqual((await admin.query('TABLE auth.provider_fixture')).rows,[{id:8}]);
  const contract={database:name,databaseOwner:owner,providerSchemas:{auth:[owner]},databaseAcl:[...acl(owner,owner,['CREATE','CONNECT','TEMPORARY']),...acl(runtime,owner,['CONNECT']),...acl(migration,owner,['CONNECT','CREATE'])],publicSchemaOwner:migration,publicSchemaAcl:[...acl(migration,migration,['USAGE','CREATE']),...acl('PUBLIC',migration,['USAGE']),...acl(runtime,migration,['USAGE'])]};
  const verify=async()=>validateSecurity(await snapshot(db),'ready',undefined,false,contract);
  assert.equal(await verify(),'schema');await assert.rejects(()=>probeDatabase(db),/Unsafe database configuration/); // strict local profile does not silently accept provider objects
  if(round===0){
   const cases=[
    ['provider sequence PUBLIC access','CREATE SEQUENCE auth.fixture_seq; GRANT USAGE ON SEQUENCE auth.fixture_seq TO PUBLIC','DROP SEQUENCE auth.fixture_seq'],
    ['privileged parameter grant',`GRANT SET ON PARAMETER session_replication_role TO ${quote(runtime)}`,`REVOKE SET ON PARAMETER session_replication_role FROM ${quote(runtime)}`],
    ['unexpected application enum',`SET ROLE ${quote(migration)}; CREATE TYPE public.fixture_type AS ENUM ('x'); RESET ROLE`,'DROP TYPE public.fixture_type'],
    ['provider table SELECT',`GRANT SELECT ON auth.provider_fixture TO ${quote(runtime)}`,`REVOKE SELECT ON auth.provider_fixture FROM ${quote(runtime)}`],
    ['provider column SELECT',`GRANT SELECT(id) ON auth.provider_fixture TO ${quote(migration)}`,`REVOKE SELECT(id) ON auth.provider_fixture FROM ${quote(migration)}`],
    ['PUBLIC provider SELECT','GRANT SELECT ON auth.provider_fixture TO PUBLIC','REVOKE SELECT ON auth.provider_fixture FROM PUBLIC'],
    ['provider schema ownership',`ALTER SCHEMA auth OWNER TO ${quote(migration)}`,`ALTER SCHEMA auth OWNER TO ${quote(owner)}; REVOKE ALL ON SCHEMA auth FROM ${quote(migration)}`],
    ['provider function execution',`CREATE FUNCTION auth.fixture() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'; GRANT USAGE ON SCHEMA auth TO ${quote(runtime)}`,`DROP FUNCTION auth.fixture(); REVOKE USAGE ON SCHEMA auth FROM ${quote(runtime)}`],
    ['Data API-style table access','GRANT SELECT ON public.products TO PUBLIC','REVOKE SELECT ON public.products FROM PUBLIC'],
    ['private function exposure','GRANT EXECUTE ON FUNCTION stich_auth.credentials(text) TO PUBLIC','REVOKE EXECUTE ON FUNCTION stich_auth.credentials(text) FROM PUBLIC'],
    ['runtime role escalation',`GRANT ${quote(migration)} TO ${quote(runtime)}`,`REVOKE ${quote(migration)} FROM ${quote(runtime)}`],
    ['provider member can assume runtime',`GRANT ${quote(runtime)} TO ${quote(owner)}`,`REVOKE ${quote(runtime)} FROM ${quote(owner)}`],
    ['extra application function',`SET ROLE ${quote(migration)}; CREATE FUNCTION stich_auth.extra() RETURNS integer LANGUAGE sql AS 'SELECT 1'; RESET ROLE`,'DROP FUNCTION stich_auth.extra()'],
   ];
   for(const[label,change,undo]of cases){try{await admin.query(change);await assert.rejects(verify,/Unsafe database configuration/,label);}finally{await admin.query('RESET ROLE');await admin.query(undo);}assert.equal(await verify(),'schema');}
   // Independent contract validation cannot authorise runtime database CREATE.
   const unsafe={...contract,databaseAcl:[...contract.databaseAcl,...acl(runtime,owner,['CREATE'])]};await assert.rejects(async()=>validateSecurity(await snapshot(db),'ready',undefined,false,unsafe),/managed application database privileges/);
  }
  const history=(await admin.query('SELECT version,checksum,execution_checksum,execution_mode FROM public.migration_history ORDER BY version')).rows;
  assert.equal(history.length,6);for(const row of history)if(bootstrapManifest[row.version]){assert.equal(row.checksum,bootstrapManifest[row.version].source);assert.equal(row.execution_checksum,bootstrapManifest[row.version].execution);assert.equal(row.execution_mode,'stich_auth_v1');}
  await admin.query("UPDATE public.migration_history SET execution_checksum=repeat('0',64) WHERE version=$1",[history[0].version]);
  await assert.rejects(()=>applyMigrations(migrator,resolve('database/migrations')),/execution checksum/);
  await admin.query('UPDATE public.migration_history SET execution_checksum=$1 WHERE version=$2',[history[0].execution_checksum,history[0].version]);
  results.push(history);await applyMigrations(migrator,resolve('database/migrations'));assert.equal(await verify(),'schema');
 });
 assert.deepEqual(results[0],results[1]);
});

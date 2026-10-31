import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sql } from 'kysely';
import { readConfig } from '../../apps/api/dist/config.js';
import { createDatabase, probeDatabase } from '../../apps/api/dist/database/connection.js';
import { applyMigrations } from '../../apps/api/dist/database/migrate.js';
import { withTenantContext } from '../../apps/api/dist/database/tenant-context.js';
import { createApp } from '../../apps/api/dist/app.js';

const config = readConfig({ ...process.env, APP_ENV: 'test' });
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (!migrationUrl || new URL(config.DATABASE_URL).pathname !== '/stichbill_test' || new URL(migrationUrl).pathname !== '/stichbill_test' || new URL(migrationUrl).host !== new URL(config.DATABASE_URL).host) throw new Error('Integration tests require separate runtime/migrator URLs for the same isolated stichbill_test database.');
test('access foundation against real PostgreSQL runtime role', async t => {
  const db=createDatabase(config.DATABASE_URL), migration=createDatabase(migrationUrl);
  const ids=Object.fromEntries(['a','b','identity','cashier','ownerA','ownerB','cashierA','shopA','shopB','shopA2','branchA','branchA2','branchB','session','cashSession','contextA','contextB','cashContext'].map(key=>[key,randomUUID()]));
  const token=randomBytes(32).toString('hex'), cashToken=randomBytes(32).toString('hex');
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const readShops=trx=>sql`select id from public.shops order by id`.execute(trx);
  let schemaReady=false;
  try {
    await applyMigrations(migration,resolve('database/migrations')); schemaReady=true;
    await migration.transaction().execute(async trx=>{
      for (const id of [ids.identity,ids.cashier]) await sql`insert into auth.identity_accounts(id,normalised_email) values (${id}::uuid,${id+'@example.test'})`.execute(trx);
      for (const tenant of [ids.a,ids.b]) {
        await sql`insert into public.tenants(id,name) values (${tenant}::uuid,'Synthetic tenant')`.execute(trx);
        await sql`insert into public.roles(tenant_id,code) values (${tenant}::uuid,'owner'),(${tenant}::uuid,'cashier')`.execute(trx);
      }
      for (const [tenant,member,identity,role] of [[ids.a,ids.ownerA,ids.identity,'owner'],[ids.b,ids.ownerB,ids.identity,'owner'],[ids.a,ids.cashierA,ids.cashier,'cashier']]) {
        await sql`insert into public.memberships(tenant_id,id,identity_id,display_name) values (${tenant}::uuid,${member}::uuid,${identity}::uuid,'Synthetic member')`.execute(trx);
        await sql`insert into public.membership_roles values (${tenant}::uuid,${member}::uuid,${role})`.execute(trx);
      }
      for (const [tenant,shop,code] of [[ids.a,ids.shopA,'A'],[ids.a,ids.shopA2,'A2'],[ids.b,ids.shopB,'B']]) await sql`insert into public.shops(tenant_id,id,code,name) values (${tenant}::uuid,${shop}::uuid,${code},'Synthetic shop')`.execute(trx);
      for (const [tenant,shop,branch,code] of [[ids.a,ids.shopA,ids.branchA,'A'],[ids.a,ids.shopA,ids.branchA2,'A2'],[ids.b,ids.shopB,ids.branchB,'B']]) await sql`insert into public.branches(tenant_id,id,shop_id,code,name) values (${tenant}::uuid,${branch}::uuid,${shop}::uuid,${code},'Synthetic branch')`.execute(trx);
      await sql`insert into public.membership_scopes(tenant_id,id,membership_id,shop_id,branch_id) values (${ids.a}::uuid,${randomUUID()}::uuid,${ids.cashierA}::uuid,${ids.shopA}::uuid,${ids.branchA}::uuid)`.execute(trx);
      for (const [session,identity,secret] of [[ids.session,ids.identity,token],[ids.cashSession,ids.cashier,cashToken]]) await sql`insert into auth.identity_sessions(id,identity_id,token_hash,expires_at) values (${session}::uuid,${identity}::uuid,${hash(secret)},now()+interval '1 hour')`.execute(trx);
      for (const [tenant,context,member,identity,session] of [[ids.a,ids.contextA,ids.ownerA,ids.identity,ids.session],[ids.b,ids.contextB,ids.ownerB,ids.identity,ids.session],[ids.a,ids.cashContext,ids.cashierA,ids.cashier,ids.cashSession]]) await sql`insert into public.membership_sessions(tenant_id,id,membership_id,identity_id,identity_session_id,expires_at) values (${tenant}::uuid,${context}::uuid,${member}::uuid,${identity}::uuid,${session}::uuid,now()+interval '1 hour')`.execute(trx);
    });
    await t.test('runtime cannot own schema, read credentials, migrate or SET ROLE',async()=>{
      await probeDatabase(db); await assert.rejects(()=>probeDatabase(migration));
      for (const query of ['create table public.forbidden_runtime_table(id int)','select * from auth.identity_sessions','select * from public.migration_history','set role stichbill_test_migrator']) await assert.rejects(()=>sql.raw(query).execute(db),{code:'42501'});
    });
    await t.test('all eight tenant tables enable and force RLS',async()=>{
      const {rows}=await sql`select relname,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname<>'migration_history'`.execute(migration);
      assert.equal(rows.length,8); assert.ok(rows.every(row=>row.relrowsecurity && row.relforcerowsecurity));
    });
    await t.test('missing context fails closed and one identity safely accesses two tenants',async()=>{
      assert.deepEqual((await readShops(db)).rows,[]);
      assert.deepEqual((await withTenantContext(db,token,ids.a,readShops)).rows.map(r=>r.id).sort(),[ids.shopA,ids.shopA2].sort());
      assert.deepEqual((await withTenantContext(db,token,ids.b,readShops)).rows,[{id:ids.shopB}]);
      await withTenantContext(db,token,ids.a,async trx=>assert.deepEqual((await sql`select * from public.shops where id=${ids.shopB}::uuid`.execute(trx)).rows,[]));
    });
    await t.test('runtime writes denied even with valid owner context and known foreign IDs',async()=>{
      await assert.rejects(()=>withTenantContext(db,token,ids.a,trx=>sql`update public.shops set name='Forbidden' where id=${ids.shopB}::uuid`.execute(trx)),{code:'42501'});
      await assert.rejects(()=>withTenantContext(db,token,ids.a,trx=>sql`insert into public.shops(tenant_id,id,code,name) values (${ids.b}::uuid,${randomUUID()}::uuid,'bad','bad')`.execute(trx)),{code:'42501'});
    });
    await t.test('cashier sees assigned shop/branch and own membership only',async()=>{
      await withTenantContext(db,cashToken,ids.a,async trx=>{
        assert.deepEqual((await readShops(trx)).rows,[{id:ids.shopA}]);
        assert.deepEqual((await sql`select id from public.branches`.execute(trx)).rows,[{id:ids.branchA}]);
        assert.deepEqual((await sql`select id from public.memberships`.execute(trx)).rows,[{id:ids.cashierA}]);
      });
      await assert.rejects(()=>withTenantContext(db,cashToken,ids.b,readShops),/Access denied/);
    });
    await t.test('unknown session, invalid tenant and fabricated context fail closed',async()=>{
      await assert.rejects(()=>withTenantContext(db,randomBytes(32).toString('hex'),ids.a,readShops),/Access denied/);
      await assert.rejects(()=>withTenantContext(db,token,'invalid',readShops),/Access denied/);
      await db.transaction().execute(async trx=>{
        await sql`select set_config('app.tenant_id',${ids.a},true),set_config('app.membership_id',${ids.ownerA},true)`.execute(trx);
        assert.deepEqual((await readShops(trx)).rows,[]);
      });
    });
    await t.test('the same pooled connection clears context after commit and rollback',async()=>{
      await db.connection().execute(async conn=>{
        await withTenantContext(conn,token,ids.a,readShops); assert.deepEqual((await readShops(conn)).rows,[]);
        await assert.rejects(()=>withTenantContext(conn,token,ids.b,async()=>{throw new Error('rollback fixture');}),/rollback fixture/);
        assert.deepEqual((await readShops(conn)).rows,[]);
      });
    });
    await t.test('membership uniqueness and composite FKs reject cross-tenant/wrong-shop links',async()=>{
      await assert.rejects(()=>sql`insert into public.memberships(tenant_id,id,identity_id,display_name) values (${ids.a}::uuid,${randomUUID()}::uuid,${ids.identity}::uuid,'Duplicate')`.execute(migration),{code:'23505'});
      await assert.rejects(()=>sql`insert into public.branches(tenant_id,id,shop_id,code,name) values (${ids.a}::uuid,${randomUUID()}::uuid,${ids.shopB}::uuid,'bad','bad')`.execute(migration),{code:'23503'});
      await assert.rejects(()=>sql`insert into public.membership_scopes(tenant_id,id,membership_id,shop_id,branch_id) values (${ids.a}::uuid,${randomUUID()}::uuid,${ids.cashierA}::uuid,${ids.shopA2}::uuid,${ids.branchA}::uuid)`.execute(migration),{code:'23503'});
      await assert.rejects(()=>sql`insert into public.membership_sessions(tenant_id,id,membership_id,identity_id,identity_session_id,expires_at) values (${ids.a}::uuid,${randomUUID()}::uuid,${ids.cashierA}::uuid,${ids.identity}::uuid,${ids.session}::uuid,now()+interval '1 hour')`.execute(migration),{code:'23503'});
    });
    await t.test('membership suspension/session expiry are scoped; global revocation invalidates all contexts',async()=>{
      await sql`update public.memberships set status='suspended' where tenant_id=${ids.a}::uuid and id=${ids.ownerA}::uuid`.execute(migration);
      await assert.rejects(()=>withTenantContext(db,token,ids.a,readShops),/Access denied/);
      assert.equal((await withTenantContext(db,token,ids.b,readShops)).rows.length,1);
      await sql`update public.memberships set status='active' where tenant_id=${ids.a}::uuid and id=${ids.ownerA}::uuid`.execute(migration);
      await sql`update public.membership_sessions set revoked_at=now() where tenant_id=${ids.a}::uuid and id=${ids.contextA}::uuid`.execute(migration);
      await assert.rejects(()=>withTenantContext(db,token,ids.a,readShops),/Access denied/);
      await sql`update public.membership_sessions set revoked_at=null,expires_at=now()-interval '1 second' where tenant_id=${ids.a}::uuid and id=${ids.contextA}::uuid`.execute(migration);
      await assert.rejects(()=>withTenantContext(db,token,ids.a,readShops),/Access denied/);
      await sql`update auth.identity_sessions set revoked_at=now() where id=${ids.session}::uuid`.execute(migration);
      await assert.rejects(()=>withTenantContext(db,token,ids.b,readShops),/Access denied/);
    });
    await t.test('migration rerun, checksum enforcement and DDL rollback',async()=>{
      await applyMigrations(migration,resolve('database/migrations'));
      await assert.rejects(()=>applyMigrations(db,resolve('database/migrations')),/dedicated/);
      const dir=await mkdtemp(join(tmpdir(),'stich-migration-')), name='20261031000100_access_foundation.sql';
      const original=await readFile(resolve('database/migrations',name),'utf8');
      try {
        await writeFile(join(dir,'20261031000300_function_defaults.sql'),await readFile(resolve('database/migrations/20261031000300_function_defaults.sql'),'utf8'));
        await writeFile(join(dir,name),original+'\n-- tampered'); await assert.rejects(()=>applyMigrations(migration,dir),/checksum/);
        await writeFile(join(dir,name),original);
        await writeFile(join(dir,'20261031000400_failure.sql'),'CREATE TABLE public.rollback_fixture(id int); SELECT 1/0;');
        await assert.rejects(()=>applyMigrations(migration,dir),{code:'22012'});
        assert.equal((await sql`select to_regclass('public.rollback_fixture') as name`.execute(migration)).rows[0].name,null);
        assert.equal((await sql`select count(*)::int as count from public.migration_history`.execute(migration)).rows[0].count,2);
      } finally {await rm(dir,{recursive:true});}
    });
    await t.test('real API readiness accepts runtime and rejects migrator credentials',async()=>{
      for (const [url,status] of [[config.DATABASE_URL,200],[migrationUrl,503]]) {
        const {app}=await createApp({...config,DATABASE_URL:url},{logger:false});
        try {await app.init(); await app.getHttpAdapter().getInstance().ready(); assert.equal((await app.inject({method:'GET',url:'/api/v1/health/ready'})).statusCode,status);}
        finally {await app.close();}
      }
    });
  } finally {
    try {
      if (schemaReady) await migration.transaction().execute(async trx=>{
        for (const table of ['membership_sessions','membership_scopes','membership_roles','branches','shops','memberships','roles']) await sql`delete from ${sql.table(`public.${table}`)} where tenant_id in (${ids.a}::uuid,${ids.b}::uuid)`.execute(trx);
        await sql`delete from public.tenants where id in (${ids.a}::uuid,${ids.b}::uuid)`.execute(trx);
        await sql`delete from auth.identity_sessions where identity_id in (${ids.identity}::uuid,${ids.cashier}::uuid)`.execute(trx);
        await sql`delete from auth.identity_accounts where id in (${ids.identity}::uuid,${ids.cashier}::uuid)`.execute(trx);
      });
    } finally {await Promise.all([db.destroy(),migration.destroy()]);}
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { resolve } from 'node:path';
import { createDatabase,probeDatabase } from '../../apps/api/dist/database/connection.js';
import { validateLocalDatabaseUrl } from '../../apps/api/dist/config.js';
import { applyMigrations } from '../../apps/api/dist/database/migrate.js';
import { provisionLocalDatabase } from '../../scripts/provision-local-db.mjs';

test('privilege rejection in an exclusively owned disposable database',async t=>{
  const base=new URL(validateLocalDatabaseUrl(process.env.ADMIN_DATABASE_URL ?? ''));
  if(base.pathname!=='/stichbill_test')throw new Error('Security tests require local test administrator configuration');
  const name=`stichbill_test_security_${randomBytes(4).toString('hex')}`;
  const id=value=>'"'+value.replaceAll('"','""')+'"';
  const adminName=decodeURIComponent(base.username),runtimeName=`${name}_runtime`,migratorName=`${name}_migrator`,parentName=`${name}_parent`;
  const adminUrl=new URL(base);adminUrl.pathname='/'+name;
  const runtimeUrl=new URL(adminUrl);runtimeUrl.username=runtimeName;runtimeUrl.password=randomBytes(24).toString('hex');
  const migratorUrl=new URL(adminUrl);migratorUrl.username=migratorName;migratorUrl.password=randomBytes(24).toString('hex');
  const env={ADMIN_DATABASE_URL:adminUrl.href,DATABASE_URL:runtimeUrl.href,MIGRATION_DATABASE_URL:migratorUrl.href};
  const controller=new pg.Client({connectionString:base.href});await controller.connect();
  let created=false,admin,db,migrator;
  try{
    await controller.query(`CREATE DATABASE ${id(name)}`);created=true;
    admin=new pg.Client({connectionString:adminUrl.href});await admin.connect();
    await provisionLocalDatabase(env);
    db=createDatabase(runtimeUrl.href);migrator=createDatabase(migratorUrl.href);
    await t.test('unmigrated readiness fails; fresh and repeated provisioning succeed',async()=>{
      await assert.rejects(()=>probeDatabase(db),/Unsafe database configuration/);
      await provisionLocalDatabase(env);
    });
    await applyMigrations(migrator,resolve('database/migrations'));
    await t.test('least-privilege configuration passes provisioning and readiness',async()=>{
      await provisionLocalDatabase(env);await probeDatabase(db);
    });
    const scenarios=[
      ...['SUPERUSER','BYPASSRLS','REPLICATION','CREATEROLE','CREATEDB','INHERIT'].map(attribute=>({name:`runtime ${attribute}`,change:`ALTER ROLE ${id(runtimeName)} ${attribute}`,undo:`ALTER ROLE ${id(runtimeName)} NO${attribute}`})),
      {name:'migrator REPLICATION',change:`ALTER ROLE ${id(migratorName)} REPLICATION`,undo:`ALTER ROLE ${id(migratorName)} NOREPLICATION`},
      {name:'direct privileged role membership',change:`GRANT pg_read_all_data TO ${id(runtimeName)}`,undo:`REVOKE pg_read_all_data FROM ${id(runtimeName)}`},
      {name:'inherited privileged membership chain',change:`CREATE ROLE ${id(parentName)}; GRANT pg_read_all_data TO ${id(parentName)}; GRANT ${id(parentName)} TO ${id(runtimeName)}`,undo:`REVOKE ${id(parentName)} FROM ${id(runtimeName)}; DROP ROLE ${id(parentName)}`},
      {name:'runtime database ownership',change:`ALTER DATABASE ${id(name)} OWNER TO ${id(runtimeName)}`,undo:`ALTER DATABASE ${id(name)} OWNER TO ${id(adminName)}; REVOKE ALL ON DATABASE ${id(name)} FROM ${id(runtimeName)},${id(migratorName)}; GRANT CONNECT ON DATABASE ${id(name)} TO ${id(runtimeName)},${id(migratorName)}; GRANT CREATE ON DATABASE ${id(name)} TO ${id(migratorName)}`},
      {name:'runtime schema ownership',change:`ALTER SCHEMA auth OWNER TO ${id(runtimeName)}`,undo:`ALTER SCHEMA auth OWNER TO ${id(migratorName)}; GRANT USAGE ON SCHEMA auth TO ${id(runtimeName)}`},
      {name:'unexpected protected-table ownership',change:`ALTER TABLE public.roles OWNER TO ${id(adminName)}`,undo:`ALTER TABLE public.roles OWNER TO ${id(migratorName)}`},
      {name:'database CREATE grant',change:`GRANT CREATE ON DATABASE ${id(name)} TO ${id(runtimeName)}`,undo:`REVOKE CREATE ON DATABASE ${id(name)} FROM ${id(runtimeName)}`},
      {name:'schema CREATE grant',change:`GRANT CREATE ON SCHEMA auth TO ${id(runtimeName)}`,undo:`REVOKE CREATE ON SCHEMA auth FROM ${id(runtimeName)}`},
      {name:'authentication SELECT grant',change:`GRANT SELECT ON auth.identity_sessions TO ${id(runtimeName)}`,undo:`REVOKE SELECT ON auth.identity_sessions FROM ${id(runtimeName)}`},
      {name:'authentication column grant',change:`GRANT SELECT(token_hash) ON auth.identity_sessions TO ${id(runtimeName)}`,undo:`REVOKE SELECT(token_hash) ON auth.identity_sessions FROM ${id(runtimeName)}`},
      {name:'tenant column UPDATE grant',change:`GRANT UPDATE(name) ON public.shops TO ${id(runtimeName)}`,undo:`REVOKE UPDATE(name) ON public.shops FROM ${id(runtimeName)}`},
      {name:'TRUNCATE bypasses row policies',change:`GRANT TRUNCATE ON public.shops TO ${id(runtimeName)}`,undo:`REVOKE TRUNCATE ON public.shops FROM ${id(runtimeName)}`},
      {name:'grant option',change:`SET ROLE ${id(migratorName)}; GRANT SELECT ON public.shops TO ${id(runtimeName)} WITH GRANT OPTION; RESET ROLE`,undo:`SET ROLE ${id(migratorName)}; REVOKE GRANT OPTION FOR SELECT ON public.shops FROM ${id(runtimeName)}; RESET ROLE`},
      {name:'system authentication catalog grant',change:`GRANT SELECT ON pg_catalog.pg_authid TO ${id(runtimeName)}`,undo:`REVOKE SELECT ON pg_catalog.pg_authid FROM ${id(runtimeName)}`},
      {name:'global default PUBLIC EXECUTE restored',change:`SET ROLE ${id(migratorName)}; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC; RESET ROLE`,undo:`SET ROLE ${id(migratorName)}; ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC; RESET ROLE`},
      {name:'PUBLIC authentication-table access',change:'GRANT SELECT ON auth.identity_accounts TO PUBLIC',undo:'REVOKE SELECT ON auth.identity_accounts FROM PUBLIC'},
      {name:'PUBLIC function execution',change:'GRANT EXECUTE ON FUNCTION auth.resolve_context(text,uuid) TO PUBLIC',undo:'REVOKE EXECUTE ON FUNCTION auth.resolve_context(text,uuid) FROM PUBLIC'},
      {name:'unexpected executable privileged function',change:`CREATE FUNCTION public.unsafe_fixture() RETURNS text LANGUAGE sql SECURITY DEFINER AS 'SELECT current_user::text'`,undo:'DROP FUNCTION public.unsafe_fixture()'},
      {name:'changed privileged function body',change:`ALTER FUNCTION auth.is_owner(uuid) SET search_path=public,pg_catalog`,undo:'ALTER FUNCTION auth.is_owner(uuid) SET search_path=pg_catalog'},
      ...['tenants','memberships','shops','branches','roles','membership_roles','membership_scopes','membership_sessions'].flatMap(table=>[
        {name:`missing FORCE RLS: ${table}`,change:`ALTER TABLE public.${table} NO FORCE ROW LEVEL SECURITY`,undo:`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`},
        {name:`missing RLS: ${table}`,change:`ALTER TABLE public.${table} DISABLE ROW LEVEL SECURITY`,undo:`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`},
        {name:`extra permissive policy: ${table}`,change:`CREATE POLICY unsafe_fixture ON public.${table} FOR SELECT TO ${id(runtimeName)} USING (true)`,undo:`DROP POLICY unsafe_fixture ON public.${table}`},
      ]),
      {name:'altered existing policy',change:'ALTER POLICY runtime_read ON public.shops USING(true)',undo:'ALTER POLICY runtime_read ON public.shops USING(active AND auth.can_access(tenant_id,id))'},
    ];
    for(const scenario of scenarios)await t.test(`rejects ${scenario.name}`,async()=>{
      try{
        await probeDatabase(db);
        await admin.query(scenario.change);
        await assert.rejects(()=>provisionLocalDatabase(env),/Unsafe database configuration/);
        await assert.rejects(()=>probeDatabase(db),/Unsafe database configuration/);
        // Repeating rejection proves provisioning did not repair/hide the unsafe state.
        await assert.rejects(()=>provisionLocalDatabase(env),/Unsafe database configuration/);
      }finally{await admin.query(scenario.undo);}
      await probeDatabase(db);
    });
    await t.test('new function has no PUBLIC or runtime EXECUTE after global default revocation',async()=>{
      try{
        await admin.query(`SET ROLE ${id(migratorName)}; CREATE FUNCTION auth.default_acl_fixture() RETURNS integer LANGUAGE sql AS 'SELECT 1'; RESET ROLE`);
        const {rows}=await admin.query("SELECT has_function_privilege($1,'auth.default_acl_fixture()','EXECUTE') AS runtime,has_function_privilege($2,'auth.default_acl_fixture()','EXECUTE') AS owner,EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='auth.default_acl_fixture()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS public",[runtimeName,migratorName]);
        assert.deepEqual(rows[0],{runtime:false,owner:true,public:false});
        const restricted=new pg.Client({connectionString:runtimeUrl.href});await restricted.connect();
        try{await assert.rejects(()=>restricted.query('SELECT auth.default_acl_fixture()'),{code:'42501'});}finally{await restricted.end();}
      }finally{await admin.query('RESET ROLE; DROP FUNCTION IF EXISTS auth.default_acl_fixture()');}
      await probeDatabase(db);
    });
  }finally{
    await Promise.all([db?.destroy(),migrator?.destroy(),admin?.end()]);
    if(created){
      // The random name is created exclusively by this test. No existing DB is ever dropped.
      assert.match(name,/^stichbill_test_security_[a-f0-9]{8}$/);
      await controller.query(`DROP DATABASE ${id(name)} WITH (FORCE)`);
      for(const role of [runtimeName,migratorName,parentName])await controller.query(`DROP ROLE IF EXISTS ${id(role)}`);
    }
    await controller.end();
  }
});

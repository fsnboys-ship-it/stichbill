import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createDatabase, probeDatabase } from '../../apps/api/dist/database/connection.js';
import { inspectSecurity, validateSecurity } from '../../apps/api/dist/database/security.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { provisionStagingDatabase } from '../../scripts/provision-staging-db.mjs';
import { createApp } from '../../apps/api/dist/app.js';
import { readConfig } from '../../apps/api/dist/config.js';

test('fresh PostgreSQL 17 staging provisioning, owner separation and HTTPS auth', async t => {
  const base = new URL(process.env.ADMIN_DATABASE_URL);
  if (!base.port) base.port = '5432';
  assert.equal(base.hostname, '127.0.0.1'); assert.ok(Number(base.port) >= 1024); assert.equal(base.pathname, '/stichbill_test');
  const controller = new pg.Client({connectionString: base.href}); await controller.connect();
  const bootstrap = 'stichbill_bootstrap_' + randomBytes(4).toString('hex');
  const bootstrapPassword = randomBytes(24).toString('hex');
  const adminUrl = new URL(base); adminUrl.pathname = '/stichbill_staging';
  adminUrl.username = bootstrap; adminUrl.password = bootstrapPassword;
  const runtimeUrl = new URL(adminUrl), migratorUrl = new URL(adminUrl);
  runtimeUrl.username = 'stichbill_staging_runtime'; runtimeUrl.password = randomBytes(24).toString('hex');
  migratorUrl.username = 'stichbill_staging_migrator'; migratorUrl.password = randomBytes(24).toString('hex');
  const owner = 'stichbill_staging_owner', runtime = runtimeUrl.username, migrator = migratorUrl.username;
  const env = {APP_ENV:'staging', APPROVE_STAGING_PROVISION:'stichbill_staging', ADMIN_DATABASE_URL:adminUrl.href, DATABASE_URL:runtimeUrl.href, MIGRATION_DATABASE_URL:migratorUrl.href};
  let created = false, bootstrapCreated = false, admin, db, migration, app;
  try {
    assert.match((await controller.query('show server_version')).rows[0].server_version, /^17\./);
    // Fail rather than reuse or drop any pre-existing staging database/roles.
    assert.equal((await controller.query("select 1 from pg_database where datname='stichbill_staging'")).rowCount,0);
    assert.equal((await controller.query('select 1 from pg_roles where rolname=any($1)',[[owner,runtime,migrator]])).rowCount,0);
    await controller.query(`CREATE ROLE ${bootstrap} LOGIN SUPERUSER PASSWORD '${bootstrapPassword}'`); bootstrapCreated = true;
    await controller.query(`CREATE DATABASE stichbill_staging OWNER ${bootstrap}`); created = true;
    admin = new pg.Client({connectionString:adminUrl.href}); await admin.connect();
    await assert.rejects(()=>provisionStagingDatabase({...env, APPROVE_STAGING_PROVISION:''}));
    const shared = new URL(runtimeUrl); shared.password=migratorUrl.password;
    await assert.rejects(()=>provisionStagingDatabase({...env,DATABASE_URL:shared.href}),/independent/);
    assert.equal((await admin.query('select 1 from pg_roles where rolname=any($1)',[[owner,runtime,migrator]])).rowCount,0);
    await t.test('fresh bootstrap rejects existing owner roles and nonempty databases without adoption',async()=>{
      try {await admin.query(`CREATE ROLE ${owner} NOLOGIN NOSUPERUSER`);await assert.rejects(()=>provisionStagingDatabase(env),/manual review/);}
      finally{await admin.query(`DROP ROLE ${owner}`);}
      try {await admin.query('CREATE TABLE public.unreviewed_fixture(id integer)');await assert.rejects(()=>provisionStagingDatabase(env));}
      finally{await admin.query('DROP TABLE public.unreviewed_fixture');}
      assert.equal((await admin.query('select 1 from pg_roles where rolname=any($1)',[[owner,runtime,migrator]])).rowCount,0);
    });
    await provisionStagingDatabase(env);
    db = createDatabase(runtimeUrl.href,'staging'); migration = createDatabase(migratorUrl.href,'staging','migrator');
    await assert.rejects(()=>probeDatabase(db));
    const cli = promisify(execFile);
    const platformEnv=Object.fromEntries(['PATH','SystemRoot','TEMP','TMP'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
    const migrationEnv={...platformEnv, APP_ENV:'staging', ALLOW_MIGRATIONS:'true', MIGRATION_DATABASE_URL:migratorUrl.href};
    await assert.rejects(()=>cli(process.execPath,['apps/api/dist/database/migrate.js','--approve-local-migrations'],{env:migrationEnv}));
    await assert.rejects(()=>cli(process.execPath,['apps/api/dist/database/migrate.js','--approve-staging-migrations'],{env:{...migrationEnv,APP_ENV:'production'}}));
    await cli(process.execPath,['apps/api/dist/database/migrate.js','--approve-staging-migrations'],{env:{...migrationEnv,APPROVE_STAGING_MIGRATIONS:'stichbill_staging'}});
    await t.test('idempotent provisioning and exact ACL/grantor readiness',async()=>{
      await provisionStagingDatabase(env); await probeDatabase(db);
      const s=await inspectSecurity(db);
      assert.equal(s.admin,owner); assert.equal(s.ownerMemberships,0);
      assert.ok(s.dbAcl.every(g=>g.grantor===owner));
      for(const r of s.relations) assert.equal(r.owner,migrator);
      const forged=structuredClone(s); forged.dbAcl.find(g=>g.role===runtime).grantor=bootstrap;
      assert.throws(()=>validateSecurity(forged,'ready'),/database ACL/);
    });
    for(const [role,url] of [[runtime,runtimeUrl],[migrator,migratorUrl]]) await t.test(`${role} cannot assume owner/bootstrap or elevate`,async()=>{
      const client=new pg.Client({connectionString:url.href}); await client.connect();
      try {for(const statement of [`SET ROLE ${owner}`,`SET ROLE ${bootstrap}`,`ALTER ROLE ${role} SUPERUSER`,`CREATE ROLE forbidden_escalation`,`ALTER DATABASE stichbill_staging OWNER TO ${role}`]) await assert.rejects(()=>client.query(statement),{code:'42501'});}
      finally{await client.end();}
    });
    const scenarios=[
      ...['LOGIN','SUPERUSER','BYPASSRLS','CREATEROLE','CREATEDB','INHERIT','REPLICATION'].map(flag=>({name:`owner ${flag}`,change:`ALTER ROLE ${owner} ${flag}`,undo:`ALTER ROLE ${owner} NO${flag}`})),
      {name:'owner unrelated catalog privilege',change:`GRANT USAGE ON SCHEMA information_schema TO ${owner}`,undo:`REVOKE USAGE ON SCHEMA information_schema FROM ${owner}`},
      {name:'owner settings',change:`ALTER ROLE ${owner} SET search_path=public`,undo:`ALTER ROLE ${owner} RESET search_path`},
      {name:'runtime owner membership',change:`GRANT ${owner} TO ${runtime}`,undo:`REVOKE ${owner} FROM ${runtime}`},
      {name:'migrator owner membership',change:`GRANT ${owner} TO ${migrator}`,undo:`REVOKE ${owner} FROM ${migrator}`},
      {name:'runtime administrator membership',change:`GRANT ${bootstrap} TO ${runtime}`,undo:`REVOKE ${bootstrap} FROM ${runtime}`},
      {name:'migrator administrator membership',change:`GRANT ${bootstrap} TO ${migrator}`,undo:`REVOKE ${bootstrap} FROM ${migrator}`},
      {name:'owner administrator membership',change:`GRANT ${bootstrap} TO ${owner}`,undo:`REVOKE ${bootstrap} FROM ${owner}`},
      ...['SUPERUSER','BYPASSRLS','CREATEROLE','CREATEDB'].map(flag=>({name:`migrator ${flag}`,change:`ALTER ROLE ${migrator} ${flag}`,undo:`ALTER ROLE ${migrator} NO${flag}`})),
      {name:'runtime extra database privilege',change:`GRANT CREATE ON DATABASE stichbill_staging TO ${runtime}`,undo:`REVOKE CREATE ON DATABASE stichbill_staging FROM ${runtime}`},
      {name:'migrator grant option',change:`GRANT CREATE ON DATABASE stichbill_staging TO ${migrator} WITH GRANT OPTION`,undo:`REVOKE GRANT OPTION FOR CREATE ON DATABASE stichbill_staging FROM ${migrator}`},
      {name:'owner owns application schema',change:`ALTER SCHEMA auth OWNER TO ${owner}`,undo:`ALTER SCHEMA auth OWNER TO ${migrator}; GRANT USAGE ON SCHEMA auth TO ${runtime}`},
      {name:'FORCE RLS removed',change:'ALTER TABLE public.shops NO FORCE ROW LEVEL SECURITY',undo:'ALTER TABLE public.shops FORCE ROW LEVEL SECURITY'},
    ];
    for(const scenario of scenarios)await t.test(`rejects ${scenario.name} without repairing it`,async()=>{
      try{await admin.query(scenario.change); await assert.rejects(()=>probeDatabase(db)); await assert.rejects(()=>provisionStagingDatabase(env)); await assert.rejects(()=>probeDatabase(db));}
      finally{await admin.query(scenario.undo);}
      await probeDatabase(db);
    });
    await t.test('owner role cannot be replaced by the bootstrap administrator',async()=>{
      try {await admin.query(`ALTER DATABASE stichbill_staging OWNER TO ${bootstrap}`);await assert.rejects(()=>probeDatabase(db));await assert.rejects(()=>provisionStagingDatabase(env));}
      finally{await admin.query(`ALTER DATABASE stichbill_staging OWNER TO ${owner}`);}
      await probeDatabase(db);
    });
    await t.test('rejects corrupted database grantor identity in PostgreSQL without repair',async()=>{
      const original=(await admin.query("select datacl::text as acl from pg_database where datname='stichbill_staging'")).rows[0].acl;
      const corrupted=original.replace(`${runtime}=c/${owner}`,`${runtime}=c/${bootstrap}`);
      assert.notEqual(corrupted,original);
      try {
        await admin.query("update pg_database set datacl=$1::aclitem[] where datname='stichbill_staging'",[corrupted]);
        await assert.rejects(()=>probeDatabase(db)); await assert.rejects(()=>provisionStagingDatabase(env));
      } finally {await admin.query("update pg_database set datacl=$1::aclitem[] where datname='stichbill_staging'",[original]);}
      await probeDatabase(db);
    });
    await t.test('separate bootstrap required; application identities cannot provision',async()=>{
      await assert.rejects(()=>provisionStagingDatabase({...env,ADMIN_DATABASE_URL:runtimeUrl.href}));
      await assert.rejects(()=>provisionStagingDatabase({...env,ADMIN_DATABASE_URL:migratorUrl.href}));
    });
    await t.test('canonical HTTPS origin, secure cookies and trusted proxy address',async()=>{
      const config=readConfig({APP_ENV:'staging',DATABASE_URL:runtimeUrl.href,APP_ORIGIN:'https://staging.example.test',SMTP_HOST:'smtp.example.test',SMTP_PORT:'587',SMTP_USER:'test',SMTP_PASSWORD:'synthetic-test-only',SMTP_FROM:'reset@example.test'});
      ({app}=await createApp(config,{logger:false,deliverReset:async()=>{}}));
      const server=app.getHttpAdapter().getInstance();
      server.get('/test-address',async request=>({ip:request.ip}));
      await app.init();await server.ready();
      for(const [remoteAddress,expected] of [['127.0.0.1','198.51.100.22'],['127.0.0.2','127.0.0.2'],['198.51.100.10','198.51.100.10']]) {
        const r=await app.inject({url:'/test-address',remoteAddress,headers:{'x-forwarded-for':'198.51.100.22'}});
        assert.equal(r.json().ip,expected);
      }
      const boot=await app.inject({url:'/api/v1/auth/csrf'});
      const csrf=boot.json().csrf;
      const cookie=boot.cookies.map(c=>`${c.name}=${c.value}`).join('; ');
      const headers={origin:config.APP_ORIGIN,cookie,'x-csrf-token':csrf,'x-forwarded-for':'198.51.100.23'};
      const payload={email:`${randomBytes(12).toString('hex')}@example.test`,password:'Synthetic-staging-password-123'};
      for(const origin of ['http://localhost:5173','https://evil.example.test','https://staging.example.test.evil.test']) {
        const r=await app.inject({method:'POST',url:'/api/v1/auth/register',remoteAddress:'127.0.0.1',headers:{...headers,origin},payload});assert.equal(r.statusCode,403);
      }
      const r=await app.inject({method:'POST',url:'/api/v1/auth/register',remoteAddress:'127.0.0.1',headers,payload});
      assert.equal(r.statusCode,200);assert.equal(r.headers['access-control-allow-origin'],undefined);
      for(const c of r.cookies){assert.equal(c.secure,true);assert.equal(c.httpOnly,true);assert.equal(c.sameSite,'Strict');assert.equal(c.domain,undefined);}
      const userHeaders={...headers,cookie:r.cookies.map(c=>`${c.name}=${c.value}`).join('; '),'x-csrf-token':r.json().csrf};
      const onboard=await app.inject({method:'POST',url:'/api/v1/auth/onboard',remoteAddress:'127.0.0.1',headers:userHeaders,payload:{businessName:'Staging test',ownerName:'Test owner'}});
      assert.equal(onboard.statusCode,200);
      const tenant=onboard.json().businessId;
      const shop=await app.inject({method:'POST',url:`/api/v1/auth/organisation/${tenant}/location`,remoteAddress:'127.0.0.1',headers:userHeaders,payload:{kind:'shop',id:null,shopId:null,code:'TEST',name:'Test shop',address:'Synthetic address',contact:'Synthetic contact',active:true}});
      assert.equal(shop.statusCode,200);
      const branch=await app.inject({method:'POST',url:`/api/v1/auth/organisation/${tenant}/location`,remoteAddress:'127.0.0.1',headers:userHeaders,payload:{kind:'branch',id:null,shopId:shop.json().id,code:'BRANCH',name:'Test branch',address:'Synthetic address',contact:'',active:true}});
      assert.equal(branch.statusCode,200);
    });
  } finally {
    await app?.close(); await Promise.all([db?.destroy(),migration?.destroy(),admin?.end()]);
    if(created){await controller.query('DROP DATABASE stichbill_staging WITH (FORCE)');for(const role of [runtime,migrator,owner])await controller.query(`DROP ROLE IF EXISTS ${role}`);}
    if(bootstrapCreated)await controller.query(`DROP ROLE ${bootstrap}`);
    await controller.end();
  }
});

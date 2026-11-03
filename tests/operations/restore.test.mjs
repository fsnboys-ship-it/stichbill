import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {pipeline} from 'node:stream/promises';
import pg from 'pg';
import {sql} from 'kysely';
import {createDatabase,probeDatabase} from '../../apps/api/dist/database/connection.js';
import {applyMigrations} from '../../apps/api/dist/database/migrate.js';
import {withTenantContext} from '../../apps/api/dist/database/tenant-context.js';
import {digest,hashPassword} from '../../apps/api/dist/auth/password.js';
import {provisionStagingDatabase} from '../../scripts/provision-staging-db.mjs';
import {createEncryptedBackup,decryptVerifiedBundle} from '../../infra/oracle/backup.mjs';
const exec=promisify(execFile),docker=['--host=unix:///var/run/docker.sock'];
const age=process.env.STICHBILL_TEST_AGE ?? '/usr/bin/age',keygen=process.env.STICHBILL_TEST_AGE_KEYGEN ?? '/usr/bin/age-keygen';
async function restore(container,file){
  const child=spawn('docker',[...docker,'exec','-i',container,'pg_restore','--username','postgres','--exit-on-error','--create','--dbname=postgres'],{stdio:['pipe','ignore','ignore']});
  const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error('Isolated restore rejected')));});
  await Promise.all([exit,pipeline(createReadStream(file),child.stdin)]);
}
test('local PostgreSQL 17 encrypted restore preserves exact ownership/grantors and invalidates old sessions',async()=>{
  const sourceContainer=process.env.STICHBILL_TEST_PG_CONTAINER;
  assert.ok(sourceContainer && /^[a-zA-Z0-9_.-]+$/.test(sourceContainer),'Set the exclusively owned test PostgreSQL container');
  const base=new URL(process.env.ADMIN_DATABASE_URL);if(!base.port)base.port='5432';
  assert.equal(base.hostname,'127.0.0.1');assert.equal(base.pathname,'/stichbill_test');
  const work=await mkdtemp(join(tmpdir(),'stich-restore-'));await chmod(work,0o700);
  const controller=new pg.Client({connectionString:base.href});await controller.connect();
  const bootstrap='stich_restore_'+randomBytes(4).toString('hex'),bootPassword=randomBytes(24).toString('hex');
  const adminUrl=new URL(base);adminUrl.pathname='/stichbill_staging';adminUrl.username=bootstrap;adminUrl.password=bootPassword;
  const runtimeUrl=new URL(adminUrl),migrationUrl=new URL(adminUrl);runtimeUrl.username='stichbill_staging_runtime';runtimeUrl.password=randomBytes(24).toString('hex');migrationUrl.username='stichbill_staging_migrator';migrationUrl.password=randomBytes(24).toString('hex');
  const owner='stichbill_staging_owner',target='stichbill-restore-'+randomBytes(4).toString('hex');
  let created=false,bootstrapCreated=false,targetCreated=false,source,migrator,destination,targetAdmin;
  try {
    assert.equal((await controller.query("select 1 from pg_database where datname='stichbill_staging'")).rowCount,0);
    assert.equal((await controller.query('select 1 from pg_roles where rolname=any($1)',[[owner,runtimeUrl.username,migrationUrl.username]])).rowCount,0);
    await controller.query(`CREATE ROLE ${bootstrap} LOGIN SUPERUSER PASSWORD '${bootPassword}'`);bootstrapCreated=true;
    await controller.query(`CREATE DATABASE stichbill_staging OWNER ${bootstrap}`);created=true;
    await provisionStagingDatabase({APP_ENV:'staging',APPROVE_STAGING_PROVISION:'stichbill_staging',ADMIN_DATABASE_URL:adminUrl.href,DATABASE_URL:runtimeUrl.href,MIGRATION_DATABASE_URL:migrationUrl.href});
    source=createDatabase(runtimeUrl.href,'staging');migrator=createDatabase(migrationUrl.href,'staging','migrator');await applyMigrations(migrator,'database/migrations');await probeDatabase(source);
    const token=randomBytes(32).toString('hex'),reset=randomBytes(32).toString('hex'),email=randomUUID()+'@example.test',hash=await hashPassword('Synthetic-restore-test-password-123');
    await sql`select auth.register_owner(${email},${hash},${digest(token)})`.execute(source);
    const tenant=(await sql`select auth.onboard(${digest(token)},'Synthetic restore business','Test owner') as id`.execute(source)).rows[0].id;
    await withTenantContext(source,token,tenant,trx=>sql`select auth.save_location(${tenant}::uuid,'shop',null,null,'RESTORE','Restore shop','Synthetic address','Test contact',true)`.execute(trx));
    await sql`select auth.request_reset(${email},${digest(reset)})`.execute(source);
    const identity=join(work,'identity'),recipients=join(work,'recipients');await exec(keygen,['-o',identity]);await chmod(identity,0o600);await writeFile(recipients,(await exec(keygen,['-y',identity])).stdout,{mode:0o600});
    const bundle=await createEncryptedBackup({root:work,recipients,age,release:'a'.repeat(40),dumpCommand:['docker',[...docker,'exec','--user','postgres',sourceContainer,'pg_dump','--username',decodeURIComponent(base.username),'--format=custom','--create','--dbname=stichbill_staging']]});
    const dump=await decryptVerifiedBundle({bundle,identity,outputDirectory:work,age});assert.equal((await readFile(dump)).subarray(0,5).toString(),'PGDMP');
    const secret=randomBytes(24).toString('hex'),env=join(work,'target.env');await writeFile(env,'POSTGRES_PASSWORD='+secret+'\n',{mode:0o600});
    await exec('docker',[...docker,'run','--detach','--name',target,'--publish','127.0.0.1::5432','--env-file',env,'postgres:17.6-bookworm']);targetCreated=true;
    const port=(await exec('docker',[...docker,'port',target,'5432/tcp'])).stdout.trim().split(':').at(-1);
    for(let n=0;n<100;n++){
      const client=new pg.Client({connectionString:`postgresql://postgres:${secret}@127.0.0.1:${port}/postgres`});
      try{await client.connect();targetAdmin=client;break;}catch{await client.end();await new Promise(resolve=>setTimeout(resolve,100));}
    }
    assert.ok(targetAdmin,'Disposable restore server must become ready');
    const roles=await readFile('infra/oracle/restore-roles.sql','utf8');
    await assert.rejects(()=>targetAdmin.query(roles));await targetAdmin.query('ROLLBACK');
    await targetAdmin.query("SET stichbill.restore_roles_approved='isolated-staging-restore'");await targetAdmin.query(roles);
    for(const url of [migrationUrl,runtimeUrl])await targetAdmin.query(`ALTER ROLE ${url.username} PASSWORD '${url.password}'`);
    await restore(target,dump);
    const targetUrl=new URL(runtimeUrl);targetUrl.port=port;destination=createDatabase(targetUrl.href,'staging');await probeDatabase(destination);
    const before=await withTenantContext(destination,token,tenant,trx=>sql`select name from public.shops`.execute(trx));assert.equal(before.rows[0].name,'Restore shop');
    await assert.rejects(()=>sql`select * from auth.identity_accounts`.execute(destination),{code:'42501'});
    // Execute the runbook's reviewed maintenance SQL only against our disposable target.
    const maintenance=(await readFile('infra/oracle/invalidate-restored-sessions.sql','utf8'));
    const quarantineUrl=new URL(`postgresql://postgres:${secret}@127.0.0.1:${port}/stichbill_staging`),quarantine=new pg.Client({connectionString:quarantineUrl.href});await quarantine.connect();
    try{await assert.rejects(()=>quarantine.query(maintenance));await quarantine.query('ROLLBACK');await quarantine.query("SET stichbill.recovery_approved='isolated-staging-restore'");await quarantine.query(maintenance);}finally{await quarantine.end();}
    await assert.rejects(()=>withTenantContext(destination,token,tenant,trx=>sql`select id from public.shops`.execute(trx)));
    assert.equal((await sql`select auth.reset_password(${digest(reset)},${hash}) as ok`.execute(destination)).rows[0].ok,false);
    const next=randomBytes(32).toString('hex');assert.equal((await sql`select auth.login(${email},${hash},${digest(next)}) as ok`.execute(destination)).rows[0].ok,true);
    assert.equal((await withTenantContext(destination,next,tenant,trx=>sql`select count(*)::int as n from public.shops`.execute(trx))).rows[0].n,1);
    await assert.rejects(()=>restore(target,dump)); // --create refuses to overwrite an existing database
    await probeDatabase(destination);
  } finally {
    await Promise.all([source?.destroy(),migrator?.destroy(),destination?.destroy(),targetAdmin?.end()]);
    if(targetCreated)await exec('docker',[...docker,'rm','--force',target]);
    if(created){await controller.query('DROP DATABASE stichbill_staging WITH (FORCE)');for(const role of [runtimeUrl.username,migrationUrl.username,owner])await controller.query(`DROP ROLE IF EXISTS ${role}`);}
    if(bootstrapCreated)await controller.query(`DROP ROLE ${bootstrap}`);
    await controller.end();await rm(work,{recursive:true,force:true});
  }
});

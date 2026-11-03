import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import {createDatabase,probeDatabase} from '../../apps/api/dist/database/connection.js';
import {applyMigrations} from '../../apps/api/dist/database/migrate.js';
import {withTenantContext} from '../../apps/api/dist/database/tenant-context.js';
import {hashPassword,secret,digest} from '../../apps/api/dist/auth/password.js';
import {createApp} from '../../apps/api/dist/app.js';
import {readConfig} from '../../apps/api/dist/config.js';
const config=readConfig(process.env);
if(new URL(config.DATABASE_URL).pathname!=='/stichbill_test')throw new Error('Isolated test DB required');
test('organisation commands enforce tenant, role, branch and concurrent ownership boundaries',async t=>{
 const db=createDatabase(config.DATABASE_URL),admin=createDatabase(process.env.MIGRATION_DATABASE_URL);
 await applyMigrations(admin,'database/migrations');await probeDatabase(db);
 const encoded=await hashPassword('Synthetic-access-password-123'),accounts=[],tenants=[];
 async function account(){const email=randomUUID()+'@example.test',token=secret();await sql`select auth.register_owner(${email},${encoded},${digest(token)})`.execute(db);const id=(await sql`select id from auth.identity_accounts where normalised_email=${email}`.execute(admin)).rows[0].id;const result={email,token,id};accounts.push(result);return result;}
 async function onboard(a){const id=(await sql`select auth.onboard(${digest(a.token)},'Synthetic tenant','Synthetic owner') as id`.execute(db)).rows[0].id;tenants.push(id);return id;}
 const read=(a,tenant)=>withTenantContext(db,a.token,tenant,async trx=>(await sql`select auth.organisation_read(${tenant}::uuid) as data`.execute(trx)).rows[0].data);
 const location=(a,tenant,kind,id,shop,code,active=true)=>withTenantContext(db,a.token,tenant,async trx=>(await sql`select auth.save_location(${tenant}::uuid,${kind},${id}::uuid,${shop}::uuid,${code},'Synthetic location','Synthetic address','Synthetic contact',${active}) as id`.execute(trx)).rows[0].id);
 const staff=(a,tenant,id,email,role,active,scopes)=>withTenantContext(db,a.token,tenant,async trx=>(await sql`select auth.save_staff(${tenant}::uuid,${id}::uuid,${email},'Synthetic staff',${role},${active},${JSON.stringify(scopes)}::jsonb) as id`.execute(trx)).rows[0].id);
 const login=async a=>{a.token=secret();assert.equal((await sql`select auth.login(${a.email},${encoded},${digest(a.token)}) as ok`.execute(db)).rows[0].ok,true);};
 try{
  const a=await account(),b=await account(),cashier=await account(),second=await account();const ta=await onboard(a),tb=await onboard(b);
  const sa=await location(a,ta,'shop',null,null,'A'),sa2=await location(a,ta,'shop',null,null,'A2'),sb=await location(b,tb,'shop',null,null,'B');
  const ba=await location(a,ta,'branch',null,sa,'A'),ba2=await location(a,ta,'branch',null,sa,'A2'),bb=await location(b,tb,'branch',null,sb,'B');
  let cashierId;
  await t.test('foreign tenant/shop/branch IDs and missing context fail closed',async()=>{
   await assert.rejects(()=>read(a,tb));await assert.rejects(()=>location(a,tb,'shop',sb,null,'bad'));
   await assert.rejects(()=>location(a,ta,'shop',sb,null,'bad'));
   await assert.rejects(()=>location(a,ta,'branch',bb,sb,'bad'));
   await assert.rejects(()=>location(a,ta,'branch',ba,sa2,'bad'));
   await assert.rejects(()=>sql`select auth.organisation_read(${ta}::uuid)`.execute(db));
   await assert.rejects(()=>withTenantContext(db,'',ta,()=>Promise.resolve()));
   await assert.rejects(()=>location(a,ta,'shop',null,null,'A'),{code:'23505'});
  });
  await t.test('cashier sees only assigned branch and cannot perform owner actions',async()=>{
   cashierId=await staff(a,ta,null,cashier.email,'cashier',true,[{shopId:sa,branchId:ba}]);await login(cashier);
   const data=await read(cashier,ta);assert.deepEqual(data.shops.map(s=>s.id),[sa]);assert.deepEqual(data.branches.map(s=>s.id),[ba]);assert.deepEqual(data.staff,[]);
   assert.ok(!data.branches.some(s=>s.id===ba2));
   await assert.rejects(()=>location(cashier,ta,'shop',sa,null,'x'),{code:'42501'});
   await assert.rejects(()=>staff(cashier,ta,cashierId,'','owner',true,[]),{code:'42501'});
   await assert.rejects(()=>staff(a,ta,cashierId,'','cashier',true,[{shopId:sa,branchId:bb}]),{code:'22023'});
   assert.deepEqual((await read(cashier,ta)).branches.map(s=>s.id),[ba]);
  });
  await t.test('inactive locations remain manageable by owner but disappear for staff',async()=>{
   await location(a,ta,'shop',sa,null,'A',false);assert.equal((await read(cashier,ta)).shops.length,0);assert.equal((await read(a,ta)).shops.length,2);
   await location(a,ta,'shop',sa,null,'A',true);
  });
  await t.test('revocation is immediate and audited; runtime cannot alter audit',async()=>{
   await staff(a,ta,cashierId,'','cashier',false,[]);await assert.rejects(()=>read(cashier,ta));
   assert.equal((await sql`select count(*)::int as n from auth.access_events where tenant_id=${ta}::uuid`.execute(admin)).rows[0].n,2);
   await assert.rejects(()=>sql`delete from auth.access_events`.execute(db),{code:'42501'});
   await assert.rejects(()=>sql`select * from auth.access_events`.execute(db),{code:'42501'});
  });
  await t.test('last owner cannot be suspended or demoted; concurrent owner changes preserve one',async()=>{
   const ownerId=(await read(a,ta)).staff.find(s=>s.role==='owner').id;
   await assert.rejects(()=>staff(a,ta,ownerId,'','cashier',true,[{shopId:sa,branchId:null}]),{code:'23514'});
   await assert.rejects(()=>staff(a,ta,ownerId,'','owner',false,[]),{code:'23514'});
   const secondId=await staff(a,ta,null,second.email,'owner',true,[]);await login(second);
   const results=await Promise.allSettled([staff(a,ta,secondId,'','owner',false,[]),staff(second,ta,ownerId,'','owner',false,[])]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   assert.equal((await sql`select count(*)::int as n from public.memberships m join public.membership_roles r on r.tenant_id=m.tenant_id and r.membership_id=m.id where m.tenant_id=${ta}::uuid and m.status='active' and r.role_code='owner'`.execute(admin)).rows[0].n,1);
  });
  await t.test('HTTP rejects CSRF and invalid tenant context',async()=>{
   const {app}=await createApp(config,{logger:false});try{await app.init();await app.getHttpAdapter().getInstance().ready();
    assert.equal((await app.inject({method:'GET',url:'/api/v1/auth/organisation/'+tb})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/organisation/'+tb+'/staff',payload:{}})).statusCode,403);
   }finally{await app.close();}
  });
 }finally{
  for(const tenant of tenants){await sql`delete from auth.access_events where tenant_id=${tenant}::uuid`.execute(admin);for(const table of ['membership_sessions','membership_scopes','membership_roles','branches','shops','memberships','roles'])await sql`delete from ${sql.table('public.'+table)} where tenant_id=${tenant}::uuid`.execute(admin);await sql`delete from public.tenants where id=${tenant}::uuid`.execute(admin);}
  for(const a of accounts){await sql`delete from auth.identity_sessions where identity_id=${a.id}::uuid`.execute(admin);await sql`delete from auth.identity_accounts where id=${a.id}::uuid`.execute(admin);}
  await Promise.all([db.destroy(),admin.destroy()]);
 }
});


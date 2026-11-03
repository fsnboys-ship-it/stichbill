import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {sql} from 'kysely';
import {readConfig} from '../../apps/api/dist/config.js';
import {createDatabase,probeDatabase} from '../../apps/api/dist/database/connection.js';
import {applyMigrations} from '../../apps/api/dist/database/migrate.js';
import {createApp} from '../../apps/api/dist/app.js';
import {digest} from '../../apps/api/dist/auth/password.js';
const config=readConfig({...process.env,APP_ENV:'test'});
if(new URL(config.DATABASE_URL).pathname!=='/stichbill_test')throw new Error('Isolated test DB required');
test('owner authentication and onboarding through real HTTP handlers and PostgreSQL',async t=>{
  const admin=createDatabase(process.env.MIGRATION_DATABASE_URL),db=createDatabase(config.DATABASE_URL);
  const delivered=[];
  await applyMigrations(admin,'database/migrations');await probeDatabase(db);
  const {app}=await createApp(config,{logger:false,deliverReset:async(email,token)=>{delivered.push({email,token});}});
  await app.init();await app.getHttpAdapter().getInstance().ready();
  const address=randomUUID()+'@example.test',plain='Synthetic-secure-password-123',newPassword='Synthetic-new-password-456';
  const jar={};let csrf='';
  const ipBytes=randomBytes(3);const remoteAddress='127.'+[...ipBytes].join('.');
  function header(){return Object.entries(jar).map(([k,v])=>k+'='+v).join('; ');}
  async function send(path,body,options={}){
    const response=await app.inject({remoteAddress,method:body===undefined?'GET':'POST',url:'/api/v1/auth/'+path,headers:{cookie:header(),origin:'http://127.0.0.1:5173','x-csrf-token':csrf,...options},...(body===undefined?{}:{payload:body})});
    for(const c of response.cookies)jar[c.name]=c.value;
    const data=response.json();if(data.csrf)csrf=data.csrf;
    return {response,data};
  }
  let business,oldCookie,reset;
  try{
    await send('csrf');
    await t.test('CSRF blocks missing, foreign origin and mismatched tokens before mutation',async()=>{
      for(const headers of [{'x-csrf-token':''},{origin:'https://evil.example'},{origin:''}])assert.equal((await send('register',{email:address,password:plain},headers)).response.statusCode,403);
      assert.equal((await sql`select count(*)::int as n from auth.identity_accounts where normalised_email=${address}`.execute(admin)).rows[0].n,0);
    });
    await t.test('registration uses opaque secure cookies and no credential/token in response',async()=>{
      const {response,data}=await send('register',{email:address,password:plain});assert.equal(response.statusCode,200);
      for(const c of response.cookies){assert.equal(c.httpOnly,true);assert.equal(c.secure,true);assert.equal(c.sameSite,'Strict');assert.equal(c.path,'/');}
      assert.ok(!JSON.stringify(data).includes(plain));
      assert.notEqual(jar['__Host-stich-session'],(await sql`select token_hash from auth.identity_sessions s join auth.identity_accounts a on a.id=s.identity_id where normalised_email=${address}`.execute(admin)).rows[0].token_hash);
      assert.deepEqual((await send('session')).data.businesses,[]);
    });
    await t.test('invalid setup leaves no partial business; concurrent onboarding creates exactly one',async()=>{
      assert.equal((await send('onboard',{businessName:'',ownerName:'Owner'})).response.statusCode,400);
      await assert.rejects(()=>sql`select auth.onboard(${digest(jar['__Host-stich-session'])},'Rollback fixture','')`.execute(db),{code:'23514'});
      assert.deepEqual((await send('session')).data.businesses,[]);
      const results=await Promise.all([send('onboard',{businessName:'Synthetic Shop',ownerName:'Test Owner'}),send('onboard',{businessName:'Duplicate',ownerName:'Test Owner'})]);
      assert.deepEqual(results.map(r=>r.response.statusCode).sort(),[200,409]);
      business=results.find(r=>r.response.statusCode===200).data.businessId;
      assert.equal((await send('session')).data.businesses.length,1);
      assert.equal((await send('business/'+business)).data.business.name,'Synthetic Shop');
      assert.equal((await send('business/'+randomUUID())).response.statusCode,403);
      assert.equal((await send('onboard',{businessName:'Other',ownerName:'Owner',tenantId:business})).response.statusCode,400);
    });
    await t.test('logout revokes server session; failed login is generic; login rotates sessions',async()=>{
      oldCookie=jar['__Host-stich-session'];await send('logout',{});assert.equal((await send('session')).response.statusCode,401);
      jar['__Host-stich-session']=oldCookie;assert.equal((await send('session')).response.statusCode,401);
      await send('csrf');
      const wrong=await send('login',{email:address,password:'Wrong-synthetic-password'});
      const unknown=await send('login',{email:randomUUID()+'@example.test',password:'Wrong-synthetic-password'});
      assert.equal(wrong.response.statusCode,401);assert.deepEqual(wrong.data,unknown.data);
      assert.equal((await send('login',{email:address,password:plain})).response.statusCode,200);assert.notEqual(jar['__Host-stich-session'],oldCookie);
    });
    await t.test('duplicate registration has same public result and cannot access original account',async()=>{
      const saved={...jar};const savedCsrf=csrf;
      const duplicate=await send('register',{email:address,password:plain});assert.equal(duplicate.response.statusCode,200);
      assert.equal((await send('session')).response.statusCode,401);Object.assign(jar,saved);csrf=savedCsrf;
    });
    await t.test('recovery is generic, token hash only; expiry and replay fail; reset revokes all sessions',async()=>{
      const known=await send('recover',{email:address});const unknown=await send('recover',{email:randomUUID()+'@example.test'});assert.deepEqual(known.data,unknown.data);
      reset=delivered.at(-1).token;
      assert.ok(!known.response.body.includes(reset));
      await sql`update auth.password_resets set expires_at=now()-interval '1 second' where token_hash=${digest(reset)}`.execute(admin);
      assert.equal((await send('reset',{token:reset,password:newPassword})).response.statusCode,400);
      await send('recover',{email:address});reset=delivered.at(-1).token;
      oldCookie=jar['__Host-stich-session'];
      const results=await Promise.all([send('reset',{token:reset,password:newPassword}),send('reset',{token:reset,password:newPassword})]);
      assert.deepEqual(results.map(r=>r.response.statusCode).sort(),[200,400]);
      jar['__Host-stich-session']=oldCookie;assert.equal((await send('session')).response.statusCode,401);
      await send('csrf');assert.equal((await send('reset',{token:reset,password:newPassword})).response.statusCode,400);
      assert.equal((await send('login',{email:address,password:plain})).response.statusCode,401);
      assert.equal((await send('login',{email:address,password:newPassword})).response.statusCode,200);
    });
    await t.test('expiry is enforced on protected endpoints',async()=>{
      await sql`update auth.identity_sessions set expires_at=now()-interval '1 second',created_at=now()-interval '1 day' where token_hash=${digest(jar['__Host-stich-session'])}`.execute(admin);
      assert.equal((await send('session')).response.statusCode,401);assert.equal((await send('business/'+business)).response.statusCode,403);
    });
    await t.test('persistent per-account throttle rejects repeated attempts, independent of API instance',async()=>{
      const target=randomUUID()+'@example.test';let last;
      for(let i=0;i<6;i++)last=await send('login',{email:target,password:plain});assert.equal(last.response.statusCode,429);
      const result=await sql`select auth.throttle(${digest('login:account:'+target)},5) as allowed`.execute(db);assert.equal(result.rows[0].allowed,false);
    });
  }finally{
    await app.close();
    const identity=(await sql`select id from auth.identity_accounts where normalised_email=${address}`.execute(admin)).rows[0]?.id;
    if(identity)await admin.transaction().execute(async trx=>{
      for(const name of ['membership_sessions','membership_roles','membership_scopes','memberships','roles'])await sql`delete from ${sql.table('public.'+name)} where tenant_id=${business}::uuid`.execute(trx);
      if(business)await sql`delete from public.tenants where id=${business}::uuid`.execute(trx);
      await sql`delete from auth.password_resets where identity_id=${identity}::uuid`.execute(trx);
      await sql`delete from auth.identity_sessions where identity_id=${identity}::uuid`.execute(trx);
      await sql`delete from auth.identity_accounts where id=${identity}::uuid`.execute(trx);
    });
    await Promise.all([db.destroy(),admin.destroy()]);
  }
});

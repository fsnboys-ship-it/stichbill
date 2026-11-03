import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {sql} from 'kysely';
import {createApp} from '../../apps/api/dist/app.js';
import {readConfig} from '../../apps/api/dist/config.js';
import {createDatabase,probeDatabase} from '../../apps/api/dist/database/connection.js';
import {applyMigrations} from '../../apps/api/dist/database/migrate.js';
import {withTenantContext} from '../../apps/api/dist/database/tenant-context.js';
import {withCatalogueContext} from '../../apps/api/dist/catalogue/routes.js';
import {hashPassword,secret,digest} from '../../apps/api/dist/auth/password.js';
import {removeUncommittedImage} from '../../apps/api/dist/catalogue/storage.js';
const config=readConfig({...process.env,APP_ENV:'test'});
if(new URL(config.DATABASE_URL).pathname!=='/stichbill_test')throw new Error('Isolated test database required');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const sampleVariant=(sku='TEE-S-RED',size='S',colour='RED',barcodes=['000123','ALIAS-1'])=>({id:null,version:null,sku,size,colour,active:true,costPrice:'12.123456',sellingPrice:'99.123456',mrp:'199',barcodes});
const productBody=p=>({id:p.id,version:p.version,styleCode:p.styleCode,name:p.name,description:p.description,categoryId:p.categoryId,brandId:p.brandId,hsnCode:p.hsnCode,active:p.active,shopIds:p.shopIds,variants:[]});
test('catalogue HTTP, PostgreSQL RLS, precision, images and owner/cashier authorization',async t=>{
 const db=createDatabase(config.DATABASE_URL),admin=createDatabase(process.env.MIGRATION_DATABASE_URL);await applyMigrations(admin,'database/migrations');await probeDatabase(db);
 const {app}=await createApp(config,{logger:false});await app.init();await app.getHttpAdapter().getInstance().ready();
 const accounts=[],tenants=[],images=[];const encoded=await hashPassword('Synthetic-catalogue-password-123');
 async function account(){const email=randomUUID()+'@example.test',token=secret();await sql`select auth.register_owner(${email},${encoded},${digest(token)})`.execute(db);const id=(await sql`select id from auth.identity_accounts where normalised_email=${email}`.execute(admin)).rows[0].id;const a={email,token,id,csrf:secret(),ip:'127.'+[...randomBytes(3)].join('.')};accounts.push(a);return a;}
 async function onboard(a){const tenant=(await sql`select auth.onboard(${digest(a.token)},'Synthetic catalogue business','Owner') as id`.execute(db)).rows[0].id;tenants.push(tenant);return tenant;}
 const location=(a,tenant,kind,shop,code)=>withTenantContext(db,a.token,tenant,async trx=>(await sql`select auth.save_location(${tenant}::uuid,${kind},null,${shop}::uuid,${code},${'Location '+code},'Test address','Test contact',true) as id`.execute(trx)).rows[0].id);
 async function request(a,tenant,scope,path='',body,headers={}){const query=new URLSearchParams(scope);const r=await app.inject({remoteAddress:a.ip,method:body===undefined?'GET':'POST',url:`/api/v1/auth/catalogue/${tenant}${path}?${query}`,headers:{origin:'http://127.0.0.1:5173',cookie:`__Host-stich-session=${a.token}; __Host-stich-csrf=${a.csrf}`,'x-csrf-token':a.csrf,...headers},...(body===undefined?{}:{payload:body})});return{status:r.statusCode,data:r.headers['content-type']?.includes('json')?r.json():null,response:r};}
 const details=async(a,tenant,scope,id)=>(await request(a,tenant,scope,'/products/'+id)).data.products[0];
 const make=(scope,style,variants=[sampleVariant()])=>({id:null,version:null,styleCode:style,name:'Cotton shirt',description:'A real catalogue record',categoryId:null,brandId:null,hsnCode:'6205',active:true,shopIds:[scope.shopId],variants});
 try{
  const owner=await account(),foreign=await account(),cashier=await account();const tenant=await onboard(owner),other=await onboard(foreign);
  const shop=await location(owner,tenant,'shop',null,'SHOP'),secondShop=await location(owner,tenant,'shop',null,'SECOND'),foreignShop=await location(foreign,other,'shop',null,'FOREIGN');
  const branch=await location(owner,tenant,'branch',shop,'B1'),sibling=await location(owner,tenant,'branch',shop,'B2'),otherBranch=await location(owner,tenant,'branch',secondShop,'B3');
  const scope={shopId:shop},cashScope={shopId:shop,branchId:branch},scope2={shopId:secondShop},foreignScope={shopId:foreignShop};
  await withTenantContext(db,owner.token,tenant,trx=>sql`select auth.save_staff(${tenant}::uuid,null,${cashier.email},'Test cashier','cashier',true,${JSON.stringify([{shopId:shop,branchId:branch}])}::jsonb)`.execute(trx));
  cashier.token=secret();await sql`select auth.login(${cashier.email},${encoded},${digest(cashier.token)})`.execute(db);
  let category,brand,product,foreignProduct;
  await t.test('category/brand create, normalized duplicate rejection and independent tenants',async()=>{
   const c=await request(owner,tenant,scope,'/categories',{id:null,version:null,name:'Clothing',active:true});assert.equal(c.status,200);category=c.data.id;
   const b=await request(owner,tenant,scope,'/brands',{id:null,version:null,name:'House brand',active:true});assert.equal(b.status,200);brand=b.data.id;
   assert.equal((await request(owner,tenant,scope,'/categories',{id:null,version:null,name:'clothing',active:true})).status,409);
   assert.equal((await request(foreign,other,foreignScope,'/categories',{id:null,version:null,name:'Clothing',active:true})).status,200);
  });
  await t.test('atomic product with sizes/colours, exact string money and barcode aliases',async()=>{
   const created=await request(owner,tenant,scope,'/products',{...make(scope,'TEE'),categoryId:category,brandId:brand,variants:[sampleVariant(),sampleVariant('TEE-XL-BLUE','XL','BLUE',['000124'])]});assert.equal(created.status,200);product=created.data.id;
   const value=await details(owner,tenant,scope,product);assert.equal(value.variants.length,2);assert.equal(value.variants.find(v=>v.sku==='TEE-S-RED').costPrice,'12.123456');assert.equal(value.variants[0].mrp,'199.000000');
   const b=await request(foreign,other,foreignScope,'/products',make(foreignScope,'TEE'));assert.equal(b.status,200);foreignProduct=b.data.id;
   assert.equal((await request(owner,tenant,scope2,'/products',make(scope2,'HIDDEN',[sampleVariant('HIDDEN-S','S','RED',['HIDDEN'])]))).status,200);
   const failed=await request(owner,tenant,scope,'/products',make(scope,'ROLLBACK',[sampleVariant('UNIQUE-FIRST','M','RED',['ATOMIC']),sampleVariant('TEE-S-RED','L','BLUE',['ATOMIC-2'])]));assert.equal(failed.status,409);
   assert.equal((await sql`select count(*)::int as n from public.products where tenant_id=${tenant}::uuid and style_code='ROLLBACK'`.execute(admin)).rows[0].n,0);
   assert.equal((await sql`select count(*)::int as n from public.product_variants where tenant_id=${tenant}::uuid and sku='UNIQUE-FIRST'`.execute(admin)).rows[0].n,0);
  });
  await t.test('SKU/barcode search, metadata filters and bounded pagination',async()=>{
   for(const search of ['TEE-S-RED','000123','BLUE','Cotton']){const r=await request(owner,tenant,{...scope,search});assert.equal(r.status,200);assert.equal(r.data.total,1);}
   assert.equal((await request(owner,tenant,{...scope,categoryId:category,brandId:brand})).data.total,1);
   assert.equal((await request(owner,tenant,{...scope,page:'2'})).data.products.length,0);
   assert.equal((await request(owner,tenant,{...scope,page:'0'})).status,400);
  });
  await t.test('cashier reads only active assigned scope and never receives cost prices',async()=>{
   const r=await request(cashier,tenant,cashScope);assert.equal(r.status,200);assert.equal(r.data.owner,false);assert.equal(r.data.products.length,1);assert.ok(!JSON.stringify(r.data).includes('costPrice'));assert.ok(!JSON.stringify(r.data).includes('HIDDEN'));
   for(const forbidden of [scope,{shopId:shop,branchId:sibling},{shopId:secondShop,branchId:otherBranch}])assert.equal((await request(cashier,tenant,forbidden)).status,403);
   assert.equal((await request(owner,other,foreignScope)).status,403);
   assert.equal((await request(owner,tenant,scope,'/products/'+foreignProduct)).status,404);
   assert.equal((await request(cashier,tenant,cashScope,'/categories',{id:null,version:null,name:'Denied',active:true})).status,403);
   assert.equal((await request(cashier,tenant,cashScope,'/products',make(cashScope,'DENIED'))).status,403);
  });
  await t.test('actual runtime RLS denies missing context and other tenant/shop rows',async()=>{
   assert.equal((await sql`select id from public.products`.execute(db)).rows.length,0);
   await withCatalogueContext(db,cashier.token,tenant,cashScope,async trx=>{
    assert.equal((await sql`select id from public.products where tenant_id=${other}::uuid`.execute(trx)).rows.length,0);
    assert.equal((await sql`select sku from public.product_variants where sku='HIDDEN-S'`.execute(trx)).rows.length,0);
    assert.equal((await sql`select barcode from public.variant_barcodes where tenant_id=${other}::uuid`.execute(trx)).rows.length,0);
   });
   for(const table of ['public.catalogue_prices','auth.catalogue_events'])await assert.rejects(()=>sql`select * from ${sql.table(table)}`.execute(db),{code:'42501'});
   await assert.rejects(()=>sql`update public.products set active=false`.execute(db),{code:'42501'});
   await assert.rejects(()=>sql`delete from public.product_variants`.execute(db),{code:'42501'});
  });
  await t.test('strict API validation, CSRF and cross-tenant foreign keys prevent forged mutations',async()=>{
   const body=make(scope,'INVALID');
   for(const patch of [{role:'owner'},{tenantId:other},{variants:[{...sampleVariant(),sellingPrice:'NaN'}]},{variants:[{...sampleVariant(),sellingPrice:1.23}]},{variants:[{...sampleVariant(),sellingPrice:'200',mrp:'100'}]}])assert.equal((await request(owner,tenant,scope,'/products',{...body,...patch})).status,400);
   assert.equal((await request(owner,tenant,scope,'/products',{...body,shopIds:[foreignShop,shop]})).status,403);
   const foreignCategory=(await request(foreign,other,foreignScope)).data.categories[0].id;
   assert.equal((await request(owner,tenant,scope,'/products',{...body,categoryId:foreignCategory})).status,403);
   assert.equal((await request(owner,tenant,scope,'/products',body,{'x-csrf-token':''})).status,403);
   assert.equal((await request(owner,tenant,scope,'/products',body,{origin:'https://evil.example.test'})).status,403);
  });
  await t.test('versioned edits, deactivation and reactivation retain records',async()=>{
   let p=await details(owner,tenant,scope,product);const old=productBody(p);
   assert.equal((await request(owner,tenant,scope,'/products',{...old,name:'Updated cotton shirt'})).status,200);
   assert.equal((await request(owner,tenant,scope,'/products',{...old,name:'Lost update'})).status,409);
   p=await details(owner,tenant,scope,product);assert.equal((await request(owner,tenant,scope,'/products',{...productBody(p),active:false})).status,200);
   assert.equal((await request(cashier,tenant,cashScope,'/products/'+product)).status,404);
   assert.equal((await request(owner,tenant,{...scope,status:'inactive'})).data.total,1);
   p=await details(owner,tenant,scope,product);assert.equal((await request(owner,tenant,scope,'/products',{...productBody(p),active:true})).status,200);
  });
  await t.test('variant identity, precision, barcode history and tenant-level uniqueness',async()=>{
   let p=await details(owner,tenant,scope,product);const v=p.variants.find(v=>v.sku==='TEE-S-RED');
   assert.equal((await request(owner,tenant,scope,`/products/${product}/variants`,sampleVariant('DIFFERENT','S','RED',['OTHER']))).status,409);
   assert.equal((await request(owner,tenant,scope,`/products/${product}/variants`,{...sampleVariant(),id:v.id,version:v.version,costPrice:'0.000001',barcodes:['NEW-PRIMARY','NEW-ALIAS']})).status,200);
   p=await details(owner,tenant,scope,product);assert.equal(p.variants.find(row=>row.id===v.id).costPrice,'0.000001');
   assert.equal((await request(owner,tenant,scope,`/products/${product}/variants`,sampleVariant('NEW-SKU','XXL','GREEN',['000123']))).status,409);
   assert.equal((await request(cashier,tenant,cashScope,`/products/${product}/variants`,sampleVariant('CASH','XXL','GREEN',['CASH']))).status,403);
   await assert.rejects(()=>withCatalogueContext(db,owner.token,tenant,scope,trx=>sql`select auth.catalogue_save(${tenant}::uuid,'variant',null,${JSON.stringify({...sampleVariant('BAD','M','GREEN',[]),id:undefined,productId:product,costPrice:'NaN'})}::jsonb)`.execute(trx)),{code:'22023'});
  });
  await t.test('private image upload/read/removal respects scope and preserves history',async()=>{
   let p=await details(owner,tenant,scope,product);
   assert.equal((await request(owner,tenant,scope,`/products/${product}/image`,{version:p.version,base64:Buffer.from('<svg></svg>').toString('base64')})).status,400);
   assert.equal((await request(cashier,tenant,cashScope,`/products/${product}/image`,{version:p.version,base64:png})).status,403);
   assert.equal((await request(owner,tenant,scope,`/products/${product}/image`,{version:p.version,base64:png})).status,200);
   p=await details(owner,tenant,scope,product);images.push([tenant,p.imageId]);const imageId=p.imageId;
   const image=await request(cashier,tenant,cashScope,'/images/'+imageId);assert.equal(image.status,200);assert.deepEqual(image.response.rawPayload,Buffer.from(png,'base64'));assert.equal(image.response.headers['x-content-type-options'],'nosniff');assert.equal(image.response.headers['cache-control'],'private, no-store');
   assert.equal((await request(foreign,tenant,scope,'/images/'+imageId)).status,404);
   assert.equal((await request(owner,tenant,scope,`/products/${product}/image`,{version:p.version-1,base64:png})).status,409);
   assert.equal((await request(owner,tenant,scope,`/products/${product}/image`,{version:p.version,base64:null})).status,200);
   assert.equal((await request(owner,tenant,scope,'/images/'+imageId)).status,404);
  });
  await t.test('term edit/deactivation and private immutable audit are functional',async()=>{
   const data=(await request(owner,tenant,scope)).data;
   const c=data.categories.find(c=>c.id===category),b=data.brands.find(b=>b.id===brand);
   assert.equal((await request(owner,tenant,scope,'/categories',{...c,name:'Renamed clothing',active:false})).status,200);
   assert.equal((await request(owner,tenant,scope,'/brands',{...b,name:'Renamed house',active:false})).status,200);
   const audit=(await sql`select count(*)::int as n from auth.catalogue_events where tenant_id=${tenant}::uuid and before_data is not null`.execute(admin)).rows[0].n;assert.ok(audit>=5);
   await assert.rejects(()=>sql`insert into auth.catalogue_events(tenant_id,actor_id,entity_kind,entity_id,after_data) values(${tenant}::uuid,${owner.id}::uuid,'product',${product}::uuid,'{}')`.execute(db),{code:'42501'});
   await probeDatabase(db);
  });
 }finally{
  await app.close();
  for(const [tenant,id] of images)await removeUncommittedImage(tenant,id).catch(()=>{});
  for(const tenant of tenants)await admin.transaction().execute(async trx=>{
   await sql`update public.products set image_id=null where tenant_id=${tenant}::uuid`.execute(trx);
   for(const table of ['auth.catalogue_events','public.product_images','public.variant_barcodes','public.catalogue_prices','public.product_variants','public.product_shops','public.products','public.categories','public.brands','auth.access_events','public.membership_sessions','public.membership_roles','public.membership_scopes','public.branches','public.shops','public.memberships','public.roles'])await sql`delete from ${sql.table(table)} where tenant_id=${tenant}::uuid`.execute(trx);
   await sql`delete from public.tenants where id=${tenant}::uuid`.execute(trx);
  });
  for(const a of accounts){await sql`delete from auth.password_resets where identity_id=${a.id}::uuid`.execute(admin);await sql`delete from auth.identity_sessions where identity_id=${a.id}::uuid`.execute(admin);await sql`delete from auth.identity_accounts where id=${a.id}::uuid`.execute(admin);}
  await Promise.all([db.destroy(),admin.destroy()]);
 }
});

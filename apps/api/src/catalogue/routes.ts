import type { FastifyInstance,FastifyRequest,FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { sql,type Kysely,type Transaction } from 'kysely';
import { z } from 'zod';
import type { Database } from '../database/connection.js';
import { withTenantContext } from '../database/tenant-context.js';
import { scopeInput,listInput,termInput,productInput,variantInput,imageInput } from './validation.js';
import { inspectImage,writeImage,readImage,removeUncommittedImage } from './storage.js';
export async function withCatalogueContext<T>(db:Kysely<Database>,token:string,tenant:string,scope:z.infer<typeof scopeInput>,work:(trx:Transaction<Database>)=>Promise<T>){
 return withTenantContext(db,token,tenant,async trx=>{
  await sql`select set_config('app.catalogue_shop_id',${scope.shopId},true),set_config('app.catalogue_branch_id',${scope.branchId ?? ''},true)`.execute(trx);
  if(!(await sql<{allowed:boolean}>`select stich_auth.catalogue_scope(${tenant}::uuid) as allowed`.execute(trx)).rows[0]?.allowed)throw Object.assign(new Error('Access denied'),{code:'42501'});
  return work(trx);
 });
}
function failure(reply:FastifyReply,error:unknown){
 if(error instanceof z.ZodError)return reply.code(400).send({message:'Check the record identifier.'});
 const code=(error as {code?:string}).code;
 return reply.code(['23505','23514','40001'].includes(code ?? '')?409:code?.startsWith('22')?400:403).send({message:code==='40001'?'This record changed. Reload and try again.':code==='23505'?'That name, style code, SKU, variant or barcode already exists.':'Unable to save or access this catalogue. Check your shop, branch and details.'});
}
export function catalogueRoutes(server:FastifyInstance,db:Kysely<Database>,session:(request:FastifyRequest)=>string){
 const prefix='/api/v1/auth/catalogue/:tenant';
 const tenantOf=(request:FastifyRequest)=>z.uuid().parse((request.params as {tenant:string}).tenant);
 const save=async(trx:Transaction<Database>,tenant:string,kind:string,id:string|null,data:object)=>(await sql<{data:{id:string;version:number}}>`select stich_auth.catalogue_save(${tenant}::uuid,${kind},${id}::uuid,${JSON.stringify(data)}::jsonb) as data`.execute(trx)).rows[0]!.data;
 for(const details of [false,true])server.get(prefix+(details?'/products/:id':''),async(request,reply)=>{
  const query=listInput.safeParse(request.query);if(!query.success)return reply.code(400).send({message:'Check catalogue filters and select a shop.'});
  try{
   const tenant=tenantOf(request),{shopId,branchId,...filters}=query.data;
   const productId=details?z.uuid().parse((request.params as {id:string}).id):undefined;
   const data=await withCatalogueContext(db,session(request),tenant,{shopId,...(branchId?{branchId}:{})},async trx=>(await sql<{data:{products:unknown[]}}>`select stich_auth.catalogue_read(${tenant}::uuid,${JSON.stringify({...filters,...(details?{productId,status:'all'}:{})})}::jsonb) as data`.execute(trx)).rows[0]!.data);
   if(details && !data.products.length)return reply.code(404).send({message:'Product unavailable.'});
   return data;
  }catch(error){return failure(reply,error);}
 });
 for(const [kind,route] of [['category','categories'],['brand','brands']] as const)server.post(prefix+'/'+route,async(request,reply)=>{
  const scope=scopeInput.safeParse(request.query),body=termInput.safeParse(request.body);if(!scope.success||!body.success)return reply.code(400).send({message:'Check name, status and version.'});
  try{const tenant=tenantOf(request),{id,...data}=body.data;return await withCatalogueContext(db,session(request),tenant,scope.data,trx=>save(trx,tenant,kind,id,data));}catch(error){return failure(reply,error);}
 });
 server.post(prefix+'/products',async(request,reply)=>{
  const scope=scopeInput.safeParse(request.query),body=productInput.safeParse(request.body);if(!scope.success||!body.success)return reply.code(400).send({message:'Check product details, shops, unique variants and decimal prices.'});
  if(!body.data.shopIds.includes(scope.data.shopId))return reply.code(400).send({message:'Keep the selected shop assigned; switch shops to remove another assignment.'});
  try{const tenant=tenantOf(request),{id,variants,...data}=body.data;
   return await withCatalogueContext(db,session(request),tenant,scope.data,async trx=>{
    const product=await save(trx,tenant,'product',id,data);
    for(const {id:variantId,...variant} of variants)await save(trx,tenant,'variant',variantId,{...variant,productId:product.id});
    return product;
   });
  }catch(error){return failure(reply,error);}
 });
 server.post(prefix+'/products/:id/variants',async(request,reply)=>{
  const scope=scopeInput.safeParse(request.query),body=variantInput.safeParse(request.body);if(!scope.success||!body.success)return reply.code(400).send({message:'Check SKU, size, colour, prices, barcodes and version.'});
  try{const tenant=tenantOf(request),productId=z.uuid().parse((request.params as {id:string}).id),{id,...data}=body.data;return await withCatalogueContext(db,session(request),tenant,scope.data,trx=>save(trx,tenant,'variant',id,{...data,productId}));}catch(error){return failure(reply,error);}
 });
 server.post(prefix+'/products/:id/image',{bodyLimit:3000000},async(request,reply)=>{
  const scope=scopeInput.safeParse(request.query),body=imageInput.safeParse(request.body);if(!scope.success||!body.success)return reply.code(400).send({message:'Choose a PNG, JPEG or WebP image up to 2 MB.'});
  let tenant='',imageId='',written=false;
  try{
   tenant=tenantOf(request);const id=z.uuid().parse((request.params as {id:string}).id);
   let image:ReturnType<typeof inspectImage>|undefined;
   if(body.data.base64!==null){try{image=inspectImage(body.data.base64);}catch{return reply.code(400).send({message:'Choose valid PNG, JPEG or WebP, up to 2 MB and 4096 × 4096.'});}imageId=randomUUID();}
   return await withCatalogueContext(db,session(request),tenant,scope.data,async trx=>{
    const result=await save(trx,tenant,'image',id,{version:body.data.version,imageId:imageId||null,...(image?{mime:image.mime,byteLength:image.byteLength,sha256:image.sha256,width:image.width,height:image.height}:{})});
    if(image){await writeImage(tenant,imageId,image.bytes);written=true;}
    return result;
   });
  }catch(error){if(written)await removeUncommittedImage(tenant,imageId).catch(()=>{});return failure(reply,error);}
 });
 server.get(prefix+'/images/:id',async(request,reply)=>{
  const scope=scopeInput.safeParse(request.query);if(!scope.success)return reply.code(400).send({message:'Select a shop and branch.'});
  try{
   const tenant=tenantOf(request),id=z.uuid().parse((request.params as {id:string}).id);
   const image=await withCatalogueContext(db,session(request),tenant,scope.data,async trx=>(await sql<{mime:string;sha256:string}>`select mime,sha256 from public.product_images where tenant_id=${tenant}::uuid and id=${id}::uuid`.execute(trx)).rows[0]);
   if(!image)return reply.code(404).send({message:'Image unavailable.'});
   return reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'").type(image.mime).send(await readImage(tenant,id,image.sha256));
  }catch{return reply.code(404).send({message:'Image unavailable.'});}
 });
}

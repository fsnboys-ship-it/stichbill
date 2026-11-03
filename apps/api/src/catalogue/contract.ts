import {z} from 'zod';
import type {OpenAPIObject} from '@nestjs/swagger';
import {scopeInput,listInput,termInput,productFields,variantFields,imageInput} from './validation.js';
export function addCatalogueContract(document:OpenAPIObject){
 const prefix='/api/v1/auth/catalogue/{tenant}',tenant={name:'tenant',in:'path' as const,required:true,schema:{type:'string',format:'uuid'}};
 const scope=Object.entries(scopeInput.shape).map(([name])=>({name,in:'query' as const,required:name==='shopId',schema:{type:'string',format:'uuid'}}));
 const responses={'200':{description:'Authorised catalogue data; decimal prices are strings and cost is owner-only'},'400':{description:'Invalid input or scope'},'403':{description:'Session, scope or owner access denied'},'404':{description:'Product/image unavailable'},'409':{description:'Duplicate identifier or stale version'}};
 document.paths[prefix]={get:{operationId:'catalogue_list',tags:['Product catalogue'],parameters:[tenant,...Object.entries(listInput.shape).map(([name])=>({name,in:'query' as const,required:name==='shopId',schema:name==='page'?{type:'integer' as const,minimum:1}:{type:'string' as const}}))],responses}};
 document.paths[prefix+'/products/{id}']={get:{operationId:'catalogue_product',tags:['Product catalogue'],parameters:[tenant,{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},...scope],responses}};
 for(const [path,schema] of Object.entries({categories:termInput,brands:termInput,products:productFields,'products/{id}/variants':variantFields,'products/{id}/image':imageInput})){
  document.paths[prefix+'/'+path]={post:{operationId:'catalogue_'+path.replaceAll(/[^a-z]/g,'_'),tags:['Product catalogue'],description:'Owner-only. Exact server session/shop/branch permission checks, CSRF header and cookie required. Prices are decimal strings with at most six places; selling price cannot exceed MRP. Create product and initial variants are atomic.',parameters:[tenant,...scope,...(path.includes('{id}')?[{name:'id',in:'path' as const,required:true,schema:{type:'string',format:'uuid'}}]:[]),{name:'X-CSRF-Token',in:'header',required:true,schema:{type:'string'}}],requestBody:{required:true,content:{'application/json':{schema:z.toJSONSchema(schema) as never}}},responses}};
 }
 document.paths[prefix+'/images/{id}']={get:{operationId:'catalogue_image',tags:['Product catalogue'],description:'Private local image, permission checked on every read; no public URL or cache.',parameters:[tenant,{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}},...scope],responses:{'200':{description:'PNG/JPEG/WebP binary'},'404':{description:'Image unavailable'}}}};
}

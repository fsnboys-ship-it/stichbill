import { mkdir,open,readFile,rm } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { createHash } from 'node:crypto';
import { imageSize } from 'image-size';
const root=resolve('work/catalogue-images');
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function path(tenant:string,id:string){if(!uuid.test(tenant)||!uuid.test(id))throw new Error('Invalid storage key');return join(root,tenant.toLowerCase(),id.toLowerCase()+'.bin');}
export function inspectImage(value:string){
 if(value.length===0 || value.length%4!==0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw new Error('Choose a valid PNG, JPEG or WebP image');
 const bytes=Buffer.from(value,'base64');
 if(bytes.length>2097152 || bytes.toString('base64')!==value)throw new Error('Image must be at most 2 MB');
 const size=imageSize(bytes),mime=({png:'image/png',jpg:'image/jpeg',webp:'image/webp'} as Record<string,string>)[size.type ?? ''];
 if(!mime || !size.width || !size.height || size.width>4096 || size.height>4096)throw new Error('Choose PNG, JPEG or WebP, at most 4096 × 4096');
 return {bytes,mime,width:size.width,height:size.height,byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function writeImage(tenant:string,id:string,bytes:Buffer){
 const target=path(tenant,id);await mkdir(join(root,tenant.toLowerCase()),{recursive:true,mode:0o700});
 const file=await open(target,'wx',0o600);
 try{await file.writeFile(bytes);await file.sync();}catch(error){await rm(target,{force:true});throw error;}finally{await file.close();}
}
export async function removeUncommittedImage(tenant:string,id:string){await rm(path(tenant,id),{force:true});}
export async function readImage(tenant:string,id:string,sha256:string){const bytes=await readFile(path(tenant,id));if(createHash('sha256').update(bytes).digest('hex')!==sha256)throw new Error('Image unavailable');return bytes;}

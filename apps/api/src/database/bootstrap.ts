import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {bootstrapManifest} from './bootstrap-manifest.js';
export const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');
// Bootstrap artifacts are explicit SQL, not arbitrary search/replace of migrations at runtime.
export async function migrationSource(name:string,source:string,namespaced:boolean){
 const contract=bootstrapManifest[name];
 if(contract && sha256(source)!==contract.source)throw new Error('Historical migration checksum changed');
 if(!contract || !namespaced)return {sql:source,mode:'original' as const};
 const mapped=await readFile(resolve('database/bootstrap',name),'utf8');
 if(sha256(mapped)!==contract.execution)throw new Error('Bootstrap execution checksum changed');
 return {sql:mapped,mode:'stich_auth_v1' as const};
}

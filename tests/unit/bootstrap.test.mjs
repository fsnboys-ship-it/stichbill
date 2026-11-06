import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bootstrapManifest} from '../../apps/api/dist/database/bootstrap-manifest.js';
import {migrationSource,sha256} from '../../apps/api/dist/database/bootstrap.js';
test('five immutable sources and explicit bootstrap SQL have independently pinned checksums',async()=>{
 assert.equal(Object.keys(bootstrapManifest).length,5);
 for(const [name,contract] of Object.entries(bootstrapManifest)){
  const source=await readFile('database/migrations/'+name,'utf8'),mapped=await migrationSource(name,source,true);
  assert.equal(sha256(source),contract.source);assert.equal(sha256(mapped.sql),contract.execution);
  assert.equal(mapped.mode,'stich_auth_v1');assert.equal(mapped.sql,source.replace(/\bauth\b/g,'stich_auth'));
  assert.equal((await migrationSource(name,source,false)).sql,source);
  await assert.rejects(()=>migrationSource(name,source+'\n-- drift',true),/checksum/);
 }
});
test('tampered executable bootstrap is rejected independently of the intact historical source',async()=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const name=Object.keys(bootstrapManifest)[0],source=await readFile('database/migrations/'+name,'utf8'),cwd=process.cwd(),root=await mkdtemp(join(tmpdir(),'stich-bootstrap-'));
 try{await mkdir(join(root,'database/bootstrap'),{recursive:true});await writeFile(join(root,'database/bootstrap',name),source.replace(/\bauth\b/g,'stich_auth')+'\n-- drift');process.chdir(root);await assert.rejects(()=>migrationSource(name,source,true),/Bootstrap execution checksum changed/);}
 finally{process.chdir(cwd);await rm(root,{recursive:true,force:true});}
});

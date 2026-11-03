import { constants, createReadStream, createWriteStream } from 'node:fs';
import { open, lstat, mkdtemp, rename, rm, chmod, realpath } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const magic = 'STICHBILL-BACKUP-1\n';
const limit = 1024 ** 3; // single-PUT operational limit; never silently switch to multipart
const fail = () => { throw new Error('Backup verification failed'); };
export async function privateDirectory(path) {
  const s = await lstat(path);
  if (!s.isDirectory() || s.isSymbolicLink() || (s.mode & 0o077) || s.uid !== process.getuid() || await realpath(path) !== resolve(path)) fail();
}
async function privateFile(path) {
  await privateDirectory(dirname(path));
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const s = await file.stat();
  if (!s.isFile() || s.uid !== process.getuid() || (s.mode & 0o077) || s.size > limit) { await file.close(); fail(); }
  return file;
}
const stream = (file, start = 0) => createReadStream('', {fd:file.fd, start, autoClose:false});
async function processExit(child) {
  await new Promise((resolve, reject) => {
    const timer=setTimeout(()=>child.kill(),300000);timer.unref();
    child.once('error', error=>{clearTimeout(timer);reject(error);});
    child.once('close', code => {clearTimeout(timer);if(code===0)resolve();else reject(new Error('Backup subprocess failed'));});
  });
}
async function encryptDump(command, age, recipients, target) {
  const dump = spawn(command[0], command[1], {stdio:['ignore','pipe','ignore']});
  const cipher = spawn(age, ['--encrypt','--recipients-file',recipients], {stdio:['pipe','pipe','ignore']});
  let prefix=Buffer.alloc(0), cipherBytes=0;
  const format=new Transform({transform(chunk,_encoding,done){prefix=Buffer.concat([prefix,chunk]).subarray(0,5);done(null,chunk);},flush(done){done(prefix.toString()==='PGDMP' ? undefined : new Error('Not a custom PostgreSQL archive'));}});
  const bound=new Transform({transform(chunk,_encoding,done){cipherBytes+=chunk.length;done(cipherBytes>limit-4096 ? new Error('Backup limit exceeded') : null,chunk);}});
  const tasks = [processExit(dump), processExit(cipher), pipeline(dump.stdout,format,cipher.stdin),
    pipeline(cipher.stdout,bound,createWriteStream(target,{flags:'wx',mode:0o600}))];
  try { await Promise.all(tasks); }
  catch { dump.kill(); cipher.kill(); await Promise.allSettled(tasks); throw new Error('Backup encryption failed; nothing published'); }
}
export async function verifyBundle(path) {
  const file = await privateFile(path);
  try {
    const before=await file.stat(), prefix=Buffer.alloc(4096);
    const {bytesRead}=await file.read(prefix,0,prefix.length,0);
    const text=prefix.subarray(0,bytesRead).toString('utf8'), end=text.indexOf('\n',magic.length);
    if (!text.startsWith(magic) || end < 0 || end > 2048) fail();
    let manifest;
    try { manifest=JSON.parse(text.slice(magic.length,end)); } catch { fail(); }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || typeof manifest.release !== 'string' || typeof manifest.sha256 !== 'string' || Object.keys(manifest).sort().join(',') !== 'cipherBytes,database,release,sha256,version' ||
        manifest.version !== 1 || manifest.database !== 'stichbill_staging' || !/^[a-f0-9]{40}$/.test(manifest.release) ||
        !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.cipherBytes) || manifest.cipherBytes < 32) fail();
    const start=Buffer.byteLength(text.slice(0,end+1)), hash=createHash('sha256'), whole=createHash('sha256');
    if (before.size !== start+manifest.cipherBytes) fail();
    whole.update(prefix.subarray(0,start));
    const signature=Buffer.alloc(22);await file.read(signature,0,22,start);
    if (signature.toString() !== 'age-encryption.org/v1\n') fail();
    for await(const chunk of stream(file,start)) {hash.update(chunk);whole.update(chunk);}
    const after=await file.stat();
    if (hash.digest('hex') !== manifest.sha256 || before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail();
    return {manifest,start,bytes:before.size,sha256:whole.digest('base64')};
  } finally {await file.close();}
}
export async function createEncryptedBackup({root,recipients,release,age='/usr/bin/age',dumpCommand=['/usr/bin/pg_dump',['--format=custom','--create','--dbname=stichbill_staging']]}) {
  await privateDirectory(root);
  if (!/^[a-f0-9]{40}$/.test(release)) fail();
  const rs=await lstat(recipients);
  if (!rs.isFile() || rs.isSymbolicLink() || (rs.mode & 0o022) || ![0,process.getuid()].includes(rs.uid)) fail();
  const partial=await mkdtemp(join(root,'.partial-')); await chmod(partial,0o700);
  const id=randomUUID(), name=id+'.sbb', ready=join(root,id+'.ready');let published=false;
  try {
    const ciphertext=join(partial,'ciphertext.age');await encryptDump(dumpCommand,age,recipients,ciphertext);
    const hash=createHash('sha256');let bytes=0;
    for await(const chunk of createReadStream(ciphertext)){bytes+=chunk.length;if(bytes>limit-4096)fail();hash.update(chunk);}
    const manifest={version:1,database:'stichbill_staging',release,sha256:hash.digest('hex'),cipherBytes:bytes};
    const bundle=join(partial,name), header=await open(bundle,'wx',0o600);
    try {await header.writeFile(magic+JSON.stringify(manifest)+'\n');}finally{await header.close();}
    await pipeline(createReadStream(ciphertext),createWriteStream(bundle,{flags:'a',mode:0o600}));
    await rm(ciphertext);await verifyBundle(bundle);
    const handle=await open(bundle,'r+');try{await handle.sync();}finally{await handle.close();}
    await chmod(bundle,0o400);
    // Only verified, complete bundles become visible to the export stage.
    await rename(partial,ready);published=true;
    const directory=await open(root,'r');try{await directory.sync();}finally{await directory.close();}
    return join(ready,name);
  } catch {await rm(published ? ready : partial,{recursive:true,force:true});throw new Error('Backup creation failed; no ready artifact');}
}
export async function decryptVerifiedBundle({bundle,identity,outputDirectory,age='/usr/bin/age'}) {
  await privateDirectory(outputDirectory);
  const key=await privateFile(identity);await key.close();
  const partial=await mkdtemp(join(outputDirectory,'.decrypt-'));await chmod(partial,0o700);
  let source;
  try {
    // Snapshot untrusted transfer input before verification/decryption, preventing path swaps.
    source=await privateFile(bundle);
    const snapshot=join(partial,'source.sbb');
    await pipeline(stream(source),createWriteStream(snapshot,{flags:'wx',mode:0o600}));
    await source.close();source=undefined;
    const {start}=await verifyBundle(snapshot), file=await privateFile(snapshot), dump=join(partial,'verified.dump');
    const child=spawn(age,['--decrypt','--identity',identity],{stdio:['pipe','pipe','ignore']});
    const tasks=[processExit(child),pipeline(stream(file,start),child.stdin),pipeline(child.stdout,createWriteStream(dump,{flags:'wx',mode:0o600}))];
    try {await Promise.all(tasks);}catch {child.kill();await Promise.allSettled(tasks);throw new Error('Decryption failed');}finally{await file.close();}
    const restored=await open(dump,'r');try {const prefix=Buffer.alloc(5);await restored.read(prefix,0,5,0);if(prefix.toString()!=='PGDMP')fail();}finally{await restored.close();}
    await rm(snapshot);
    // Caller may invoke pg_restore ONLY after this returns successfully.
    return dump;
  } catch {await source?.close();await rm(partial,{recursive:true,force:true});throw new Error('Backup decryption failed; no restore input released');}
}
export async function uploadVerifiedBundle({bundle,scratch,approved=false,put}) {
  if (approved !== true) throw new Error('Backup uploads are disabled pending host/IAM isolation acceptance');
  await privateDirectory(scratch);
  const name=basename(bundle);
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.sbb$/.test(name)) fail();
  const partial=await mkdtemp(join(scratch,'.upload-'));await chmod(partial,0o700);
  let file;
  try {
    file=await privateFile(bundle);const snapshot=join(partial,name);
    await pipeline(stream(file),createWriteStream(snapshot,{flags:'wx',mode:0o600}));await file.close();file=undefined;
    const verified=await verifyBundle(snapshot);await chmod(snapshot,0o400);
    // ONE immutable object contains ciphertext AND checksum. No separate sidecar PUT.
    await put({file:snapshot,name:'staging/'+name,sha256:verified.sha256,bytes:verified.bytes});
  } finally {await file?.close();await rm(partial,{recursive:true,force:true});}
}

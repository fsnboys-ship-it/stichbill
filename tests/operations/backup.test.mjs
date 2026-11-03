import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,chmod,stat,symlink,truncate} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {createEncryptedBackup,verifyBundle,decryptVerifiedBundle,uploadVerifiedBundle} from '../../infra/oracle/backup.mjs';
const exec=promisify(execFile),age=process.env.STICHBILL_TEST_AGE ?? '/usr/bin/age',keygen=process.env.STICHBILL_TEST_AGE_KEYGEN ?? '/usr/bin/age-keygen';
const release='a'.repeat(40),plain='PGDMP synthetic encrypted backup fixture; never real account data';
async function fixture(work){
  const root=await mkdtemp(join(tmpdir(),'stich-backup-'));await chmod(root,0o700);
  try {
    const identity=join(root,'identity');await exec(keygen,['-o',identity]);await chmod(identity,0o600);
    const {stdout}=await exec(keygen,['-y',identity]);const recipients=join(root,'recipients');await writeFile(recipients,stdout,{mode:0o600});
    const options={root,recipients,release,age,dumpCommand:[process.execPath,['-e',`process.stdout.write(${JSON.stringify(plain)})`]]};
    await work({root,identity,options});
  }finally{await rm(root,{recursive:true,force:true});}
}
test('real age encryption, private publication, checksum and authenticated roundtrip',()=>fixture(async({root,identity,options})=>{
  const bundle=await createEncryptedBackup(options),bytes=await readFile(bundle);
  assert.ok(!bytes.includes(Buffer.from(plain)));assert.ok(bytes.includes(Buffer.from('age-encryption.org/v1\n')));
  assert.equal((await stat(bundle)).mode & 0o777,0o400);assert.equal((await stat(root)).mode & 0o777,0o700);
  const verified=await verifyBundle(bundle);assert.equal(verified.manifest.release,release);
  const dump=await decryptVerifiedBundle({bundle,identity,outputDirectory:root,age});assert.equal(await readFile(dump,'utf8'),plain);
  assert.equal((await stat(dump)).mode & 0o777,0o600);
}));
test('dump/encrypt failures never produce a ready artifact or invoke upload',()=>fixture(async({root,options})=>{
  const brokenAge=join(root,'broken-age.mjs');await writeFile(brokenAge,"#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on('end',()=>{process.stdout.write('age-encryption.org/v1\\npartial');process.exitCode=1;});\n",{mode:0o700});
  for(const change of [{age:brokenAge},{dumpCommand:[process.execPath,['-e',"process.stdout.write('not a pg_dump archive')"]]},{dumpCommand:[process.execPath,['-e',"process.stdout.write('PGDMP partial');process.exit(1)"]]},{age:'/definitely-missing-age'}]) {
    await assert.rejects(()=>createEncryptedBackup({...options,...change}));
    assert.ok(!(await readdir(root)).some(name=>name.endsWith('.ready')||name.startsWith('.partial-')));
  }
}));
test('wrong recovery key releases no plaintext restore input',()=>fixture(async({root,options})=>{
  const bundle=await createEncryptedBackup(options),wrong=join(root,'wrong-key');await exec(keygen,['-o',wrong]);
  await assert.rejects(()=>decryptVerifiedBundle({bundle,identity:wrong,outputDirectory:root,age}));
  assert.ok(!(await readdir(root)).some(name=>name.startsWith('.decrypt-')));
}));
test('corruption, truncation, unsafe modes, symlinks and checksum substitutions block transport',()=>fixture(async({root,options})=>{
  const good=await createEncryptedBackup(options),original=await readFile(good);let calls=0;
  const put=async()=>{calls++;};
  const cases=[original.subarray(0,original.length-10),Buffer.from(original)];cases[1][cases[1].length-1]^=1;
  const headerEnd=original.indexOf(10,original.indexOf(10)+1),manifest=JSON.parse(original.subarray(original.indexOf(10)+1,headerEnd));
  manifest.sha256='0'.repeat(64);cases.push(Buffer.concat([Buffer.from('STICHBILL-BACKUP-1\n'+JSON.stringify(manifest)+'\n'),original.subarray(headerEnd+1)]));
  for(const bytes of cases){const file=join(root,randomUUID()+'.sbb');await writeFile(file,bytes,{mode:0o600});await assert.rejects(()=>uploadVerifiedBundle({bundle:file,scratch:root,approved:true,put}));}
  const unsafe=join(root,randomUUID()+'.sbb');await writeFile(unsafe,original,{mode:0o644});await chmod(unsafe,0o644);await assert.rejects(()=>uploadVerifiedBundle({bundle:unsafe,scratch:root,approved:true,put}));
  const large=join(root,randomUUID()+'.sbb');await writeFile(large,'',{mode:0o600});await truncate(large,1024**3+1);await assert.rejects(()=>uploadVerifiedBundle({bundle:large,scratch:root,approved:true,put}));
  const link=join(root,randomUUID()+'.sbb');await symlink(good,link);await assert.rejects(()=>uploadVerifiedBundle({bundle:link,scratch:root,approved:true,put}));
  const insecure=join(root,'insecure');await mkdir(insecure,{mode:0o755});await chmod(insecure,0o755);await assert.rejects(()=>createEncryptedBackup({...options,root:insecure}));
  assert.equal(calls,0);
}));
test('upload disabled by default; one verified snapshot/one PUT; failure keeps source without success receipt',()=>fixture(async({root,options})=>{
  const bundle=await createEncryptedBackup(options);let calls=0;
  const put=async value=>{calls++;assert.equal((await stat(value.file)).mode & 0o777,0o400);const verified=await verifyBundle(value.file);assert.equal(value.sha256,verified.sha256);assert.equal(value.sha256,createHash('sha256').update(await readFile(value.file)).digest('base64'));assert.ok(value.name.startsWith('staging/'));};
  await assert.rejects(()=>uploadVerifiedBundle({bundle,scratch:root,put}));assert.equal(calls,0);
  await uploadVerifiedBundle({bundle,scratch:root,approved:true,put});assert.equal(calls,1);
  await assert.rejects(()=>uploadVerifiedBundle({bundle,scratch:root,approved:true,put:async()=>{calls++;throw new Error('synthetic uncertain upload outcome');}}));
  assert.equal(calls,2);await verifyBundle(bundle);assert.ok(!(await readdir(root)).some(name=>name.startsWith('.upload-')));
}));

test('recomputed checksum cannot bypass age authentication or release truncated plaintext',()=>fixture(async({root,identity,options})=>{
  const good=await createEncryptedBackup(options),data=await readFile(good),end=data.indexOf(10,data.indexOf(10)+1);
  const manifest=JSON.parse(data.subarray(data.indexOf(10)+1,end));
  const cipher=Buffer.from(data.subarray(end+1));cipher[cipher.length-1]^=1;
  manifest.sha256=createHash('sha256').update(cipher).digest('hex');
  const altered=join(root,randomUUID()+'.sbb');await writeFile(altered,Buffer.concat([Buffer.from('STICHBILL-BACKUP-1\n'+JSON.stringify(manifest)+'\n'),cipher]),{mode:0o600});
  await verifyBundle(altered); // checksum alone is NOT authenticity
  await assert.rejects(()=>decryptVerifiedBundle({bundle:altered,identity,outputDirectory:root,age}));
  assert.ok(!(await readdir(root)).some(name=>name.startsWith('.decrypt-')));
}));
test('uncontrolled recipient files are rejected and uploader CLI stays disabled without credentials',()=>fixture(async({root,options})=>{
  await chmod(options.recipients,0o666);await assert.rejects(()=>createEncryptedBackup(options));
  assert.ok(!(await readdir(root)).some(name=>name.endsWith('.ready')));
  for(const gate of [{STICHBILL_ENABLE_UPLOADS:'no'},{STICHBILL_ENABLE_UPLOADS:'yes',CREDENTIALS_DIRECTORY:'/tmp/untrusted-credential-directory'}])
    await assert.rejects(()=>exec(process.execPath,['infra/oracle/upload-backup.mjs','--approved-isolated-uploader'],{env:{PATH:process.env.PATH,...gate},timeout:3000}),error=>error.code===1 && error.stderr.includes('disabled or failed'));
}));

test('upload uses a verified private snapshot even if the transferred source changes',()=>fixture(async({root,options})=>{
  const bundle=await createEncryptedBackup(options),original=await readFile(bundle);
  await uploadVerifiedBundle({bundle,scratch:root,approved:true,put:async value=>{
    await chmod(bundle,0o600);await writeFile(bundle,'changed after snapshot');
    assert.deepEqual(await readFile(value.file),original);await verifyBundle(value.file);
  }});
}));

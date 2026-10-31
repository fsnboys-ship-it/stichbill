import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { separateEnvironment,verifySeparation,serializeEnv } from '../../scripts/env-separation.mjs';
import { rewriteEnvironment } from '../../scripts/setup-db-env.mjs';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,sep } from 'node:path';
import { pathToFileURL } from 'node:url';
const admin='postgresql://postgres:synthetic-admin%23%27%22%5C@127.0.0.1:5432/stichbill_dev';
for(const [name,prefix,equals,eol,final]of [
  ['normal','', '=','\n',true],['export','export ','=','\n',true],['whitespace','  ',' = ','\n',true],
  ['CRLF','export ',' = ','\r\n',true],['no final newline','','=','\n',false],
])test(`environment separation: ${name}`,()=>{
  const source=[`${prefix}DATABASE_URL${equals}"${admin}"`,`${prefix}APP_ENV${equals}'development'`,`${prefix}POSTGRES_PASSWORD${equals}'synthetic-admin'`].join(eol)+(final?eol:'');
  const result=separateEnvironment(source);
  const {runtime,privileged}=verifySeparation(result.runtimeText,result.adminText);
  assert.equal(runtime.APP_ENV,'development');assert.equal(new URL(runtime.DATABASE_URL).username,'stichbill_dev_runtime');
  assert.equal(privileged.ADMIN_DATABASE_URL,admin);assert.equal(runtime.POSTGRES_PASSWORD,undefined);
});
test('preserves existing administrator, migrator and restricted runtime credentials on rerun',()=>{
  const first=separateEnvironment(`DATABASE_URL=${admin}`);
  const second=separateEnvironment(first.runtimeText,first.adminText);
  assert.deepEqual(second,first);
  const merged=separateEnvironment(first.runtimeText+first.adminText);
  assert.deepEqual(merged,first);
});
test('quoted special characters and multiline values serialize without interpolation or loss',()=>{
  const values={ONE:"spaces # dollar$ backslash\\ single'",TWO:'double"quote',THREE:'line1\nline2',FOUR:'both\'"quotes'};
  assert.deepEqual(parseEnv(serializeEnv(values)),values);
});
test('unknown keys, ambiguous existing credentials, unsafe URLs and unseparated files fail without printing secrets',()=>{
  for(const source of [`DATABASE_URL=${admin}\nSAVED_ADMIN_PASSWORD=do-not-print`,`DATABASE_URL=postgresql://u:do-not-print@remote.invalid/stichbill_dev`,`DATABASE_URL=broken`]) {
    assert.throws(()=>separateEnvironment(source),error=>!error.message.includes('do-not-print'));
  }
  assert.throws(()=>separateEnvironment(`DATABASE_URL=${admin}\nADMIN_DATABASE_URL=${admin}`,'ADMIN_DATABASE_URL=postgresql://other:synthetic@localhost/stichbill_dev'));
  const good=separateEnvironment(`DATABASE_URL=${admin}`);
  assert.throws(()=>verifySeparation(`DATABASE_URL=${admin}`,good.adminText));
  assert.throws(()=>verifySeparation(good.runtimeText+'POSTGRES_PASSWORD=secret',good.adminText));
  assert.throws(()=>verifySeparation(good.runtimeText+serializeEnv({API_HOST:decodeURIComponent(new URL(admin).password)}),good.adminText));
});
test('actual file rewrite verifies persisted separation, preserves existing credentials and fails without changing files',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'stich-env-'));
  const root=pathToFileURL(directory+sep);
  try {
    await writeFile(join(directory,'.env'),`export DATABASE_URL = "${admin}"\r\nPOSTGRES_PASSWORD = 'synthetic-admin'`);
    await rewriteEnvironment(root);
    const runtime=await readFile(join(directory,'.env'),'utf8'),privileged=await readFile(join(directory,'.env.db'),'utf8');
    verifySeparation(runtime,privileged);
    await rewriteEnvironment(root);
    assert.equal(await readFile(join(directory,'.env'),'utf8'),runtime);
    assert.equal(await readFile(join(directory,'.env.db'),'utf8'),privileged);
    const invalid=runtime+'UNKNOWN_SECRET=synthetic-secret\n';
    await writeFile(join(directory,'.env'),invalid);
    await assert.rejects(()=>rewriteEnvironment(root),error=>!error.message.includes('synthetic-secret'));
    assert.equal(await readFile(join(directory,'.env'),'utf8'),invalid);
    assert.equal(await readFile(join(directory,'.env.db'),'utf8'),privileged);
  }finally{await rm(directory,{recursive:true,force:true});}
});

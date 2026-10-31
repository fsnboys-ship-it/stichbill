import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';

const runtimeKeys=['APP_ENV','API_HOST','API_PORT','ALLOW_MIGRATIONS','DATABASE_URL'];
const adminKeys=['ADMIN_DATABASE_URL','MIGRATION_DATABASE_URL','POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_DB','POSTGRES_PORT'];
const fail=()=>{throw new Error('Environment separation failed: check supported keys, local URLs and distinct role credentials. Values are not logged.');};
function localUrl(value) {
  let url; try{url=new URL(value);}catch{fail();}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!['/stichbill_dev','/stichbill_test'].includes(url.pathname)||!url.username||!url.password||url.search||url.hash)fail();
  try{decodeURIComponent(url.password);}catch{fail();}
  return url;
}
export function serializeEnv(values) {
  const text=Object.entries(values).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>{
    if(!/^[A-Z_][A-Z0-9_]*$/.test(key)||typeof value!=='string'||value.includes('\0'))fail();
    const quote=["'",'"','`'].find(q=>!value.includes(q));
    if(!quote)fail();
    return `${key}=${quote}${value}${quote}`;
  }).join('\n')+'\n';
  const parsed=parseEnv(text);
  if(Object.keys(parsed).length!==Object.keys(values).length || Object.entries(values).some(([k,v])=>parsed[k]!==v))fail();
  return text;
}
export function verifySeparation(runtimeText,adminText) {
  const runtime=parseEnv(runtimeText), privileged=parseEnv(adminText);
  if(Object.keys(runtime).some(k=>!runtimeKeys.includes(k))||Object.keys(privileged).some(k=>!adminKeys.includes(k)))fail();
  const admin=localUrl(privileged.ADMIN_DATABASE_URL), migrator=localUrl(privileged.MIGRATION_DATABASE_URL), app=localUrl(runtime.DATABASE_URL);
  const db=admin.pathname.slice(1);
  if(app.username!==`${db}_runtime`||migrator.username!==`${db}_migrator`||[app.username,migrator.username].includes(admin.username)||[app,migrator].some(u=>u.host!==admin.host||u.pathname!==admin.pathname))fail();
  const secrets=[admin.password,migrator.password,decodeURIComponent(admin.password),decodeURIComponent(migrator.password),privileged.POSTGRES_PASSWORD].filter(Boolean);
  if(secrets.some(secret=>runtimeText.includes(secret)))fail();
  return {runtime,privileged};
}
export function separateEnvironment(source,existingAdmin='') {
  const input=parseEnv(source), old=parseEnv(existingAdmin);
  if(Object.keys(input).some(k=>![...runtimeKeys,...adminKeys].includes(k))||Object.keys(old).some(k=>!adminKeys.includes(k)))fail();
  const privileged={...old};
  for(const key of adminKeys) if(input[key]!==undefined) {
    if(old[key]!==undefined && old[key]!==input[key])fail();
    privileged[key]=input[key];
  }
  const admin=localUrl(privileged.ADMIN_DATABASE_URL ?? input.DATABASE_URL);
  const db=admin.pathname.slice(1);
  if([`${db}_runtime`,`${db}_migrator`].includes(admin.username))fail();
  privileged.ADMIN_DATABASE_URL=admin.href;
  const migrator=privileged.MIGRATION_DATABASE_URL?localUrl(privileged.MIGRATION_DATABASE_URL):new URL(admin);
  if(!privileged.MIGRATION_DATABASE_URL) {migrator.username=`${db}_migrator`;migrator.password=randomBytes(24).toString('hex');}
  privileged.MIGRATION_DATABASE_URL=migrator.href;
  const current=localUrl(input.DATABASE_URL);
  const app=current.username===`${db}_runtime`?current:new URL(admin);
  if(app.username!==`${db}_runtime`){app.username=`${db}_runtime`;app.password=randomBytes(24).toString('hex');}
  const runtime=Object.fromEntries(runtimeKeys.filter(k=>input[k]!==undefined).map(k=>[k,input[k]]));
  runtime.DATABASE_URL=app.href;
  const runtimeText=serializeEnv(runtime),adminText=serializeEnv(privileged);
  verifySeparation(runtimeText,adminText);
  return {runtimeText,adminText};
}

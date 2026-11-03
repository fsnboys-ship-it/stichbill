import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import https from 'node:https';
import http from 'node:http';
const exec=promisify(execFile),docker=['--host=unix:///var/run/docker.sock'];
const image='nginx:stable-alpine@sha256:0e52bd054126cdc040b1276c0af347aeb02a41b9cfe305d6094767ac30e97949';
function request(port,path,{tls=true,host='staging.example.invalid',ca}={}){
  return new Promise((resolve,reject)=>{
    const r=(tls?https:http).get({hostname:'127.0.0.1',port,path,headers:{Host:host},...(tls?{servername:host,ca,rejectUnauthorized:true}:{})},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body}));});
    r.on('error',reject);r.setTimeout(3000,()=>r.destroy(new Error('Local Nginx test timeout')));
  });
}
test('local rendered Nginx TLS/routing rejects unknown SNI and keeps API errors outside SPA fallback',async()=>{
  const work=await mkdtemp(join(tmpdir(),'stich-nginx-')),name='stich-nginx-'+randomBytes(4).toString('hex');let created=false;
  try{
    const cert=join(work,'tls'),web=join(work,'web');await mkdir(cert,{mode:0o700});await mkdir(web,{mode:0o755});await chmod(web,0o755);
    await writeFile(join(web,'index.html'),'synthetic SPA fixture',{mode:0o644});await chmod(join(web,'index.html'),0o644);
    await exec('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(cert,'privkey.pem'),'-out',join(cert,'fullchain.pem'),'-days','1','-subj','/CN=staging.example.invalid','-addext','subjectAltName=DNS:staging.example.invalid']);
    const ca=await readFile(join(cert,'fullchain.pem'));
    await exec('docker',[...docker,'run','--detach','--name',name,'--publish','127.0.0.1::443','--publish','127.0.0.1::80','--mount',`type=bind,src=${resolve('infra/oracle/nginx-staging.conf')},dst=/etc/nginx/conf.d/default.conf,readonly`,'--mount',`type=bind,src=${resolve('infra/oracle/nginx-api.conf')},dst=/etc/nginx/snippets/stichbill-api.conf,readonly`,'--mount',`type=bind,src=${cert},dst=/etc/letsencrypt/live/staging.example.invalid,readonly`,'--mount',`type=bind,src=${web},dst=/opt/stichbill/current/apps/web/dist,readonly`,image]);created=true;
    const port=async internal=>(await exec('docker',[...docker,'port',name,internal+'/tcp'])).stdout.trim().split(':').at(-1);
    const tlsPort=await port('443'),httpPort=await port('80');
    let response;for(let n=0;n<50;n++){try{response=await request(tlsPort,'/',{ca});break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
    assert.equal(response?.status,200);assert.equal(response.body,'synthetic SPA fixture');
    assert.equal((await request(tlsPort,'/owner/screen',{ca})).body,'synthetic SPA fixture');
    assert.equal((await request(tlsPort,'/api/v1/health',{ca})).status,502); // no test API listener: never SPA 200
    assert.equal((await request(tlsPort,'/api/docs',{ca})).status,404);
    assert.equal((await request(tlsPort,'/api/v1/health/ready',{ca})).status,404);
    const redirect=await request(httpPort,'/owner',{tls:false});assert.equal(redirect.status,308);assert.equal(redirect.headers.location,'https://staging.example.invalid/owner');
    await assert.rejects(()=>request(tlsPort,'/',{ca,host:'unknown.example.invalid'}),error=>error.code==='EPROTO');
    await assert.rejects(()=>request(httpPort,'/',{tls:false,host:'unknown.example.invalid'}));
    await exec('docker',[...docker,'exec',name,'nginx','-t']);
  }finally{if(created)await exec('docker',[...docker,'rm','--force',name]);await rm(work,{recursive:true,force:true});}
});

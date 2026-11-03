import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {readConfig,canonicalOrigin,validateStagingDatabaseUrl} from '../../apps/api/dist/config.js';
import {createSmtpDelivery} from '../../apps/api/dist/auth/smtp-delivery.js';
const env={APP_ENV:'staging',DATABASE_URL:'postgresql://stichbill_staging_runtime:'+ 'a'.repeat(48)+'@127.0.0.1:5432/stichbill_staging',APP_ORIGIN:'https://staging.example.test',SMTP_HOST:'smtp.example.test',SMTP_PORT:'587',SMTP_USER:'synthetic-user',SMTP_PASSWORD:'synthetic-only',SMTP_FROM:'reset@example.test'};
test('strict staging configuration accepts only dedicated target and full recovery configuration',()=>{
  assert.equal(readConfig(env).APP_ENV,'staging');
  for(const change of [{ADMIN_DATABASE_URL:'must-not-reach-runtime'},{MIGRATION_DATABASE_URL:'must-not-reach-runtime'},{POSTGRES_PASSWORD:'must-not-reach-runtime'},{APP_ENV:'production'},{ALLOW_MIGRATIONS:'true'},{SMTP_PASSWORD:''},{SMTP_PORT:'25'},{SMTP_FROM:'Name\r\nBcc:bad@example.test'},{SMTP_HOST:'smtp.test/path'},{APP_ORIGIN:'http://staging.example.test'}])assert.throws(()=>readConfig({...env,...change}));
});
for(const origin of ['http://staging.example.test','https://localhost','https://127.0.0.1','https://staging.example.test/','https://staging.example.test/path','https://user:pass@staging.example.test','https://staging.example.test:8443','https://staging.example.test?x=1','https://staging.example.test#x','https://STAGING.example.test'])test(`rejects noncanonical origin ${origin}`,()=>assert.throws(()=>canonicalOrigin(origin)));
test('staging database URLs reject remote hosts, wrong roles, names and connection overrides',()=>{
  for(const value of [env.DATABASE_URL.replace('127.0.0.1','localhost'),env.DATABASE_URL.replace('127.0.0.1','db.example.test'),env.DATABASE_URL.replace('5432','0'),env.DATABASE_URL+'?host=evil.test',env.DATABASE_URL+'#x',env.DATABASE_URL.replace('/stichbill_staging','/stichbill_dev'),env.DATABASE_URL.replace('_runtime:','_migrator:'),env.DATABASE_URL.replace('a'.repeat(48),'short')])assert.throws(()=>validateStagingDatabaseUrl(value,'runtime'),error=>!error.message.includes('aaaa'));
});
test('SMTP delivery enforces verified TLS, canonical reset fragments and redacted failures',async()=>{
  const deliveries=[];let settings;let failed=false;
  const transport=mock.method(nodemailer,'createTransport',options=>{settings=options;return {sendMail:async message=>{deliveries.push(message);if(failed)throw new Error('provider-secret-token');}};});
  const logs=[];const logging=mock.method(console,'error',message=>logs.push(message));
  try {
    const send=createSmtpDelivery(readConfig(env));await send('recipient@example.test','c'.repeat(64));
    assert.equal(settings.requireTLS,true);assert.equal(settings.tls.rejectUnauthorized,true);assert.equal(settings.logger,false);
    assert.equal(settings.disableFileAccess,true);assert.equal(settings.disableUrlAccess,true);
    assert.ok(deliveries[0].text.includes('https://staging.example.test/#reset='));
    failed=true;await assert.rejects(()=>send('recipient@example.test','c'.repeat(64)),{message:'Recovery delivery failed'});
    assert.deepEqual(logs,['STICH BILL recovery delivery failed']);
  }finally{transport.mock.restore();logging.mock.restore();}
});

test('real SMTP transport refuses plaintext authentication when STARTTLS fails',async()=>{
  const {createServer}=await import('node:net');
  const sockets=new Set(),commands=[];
  const server=createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
    socket.write('220 synthetic-test SMTP\r\n');
    socket.on('data',chunk=>{
      const command=chunk.toString();commands.push(command);
      if(command.startsWith('EHLO'))socket.write('250-synthetic-test\r\n250 AUTH PLAIN LOGIN\r\n');
      else if(command.startsWith('STARTTLS'))socket.write('454 TLS not available\r\n');
      else socket.write('500 rejected\r\n');
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const logs=[];const logging=mock.method(console,'error',message=>logs.push(message));
  try {
    const send=createSmtpDelivery({...readConfig(env),SMTP_HOST:'127.0.0.1',SMTP_PORT:server.address().port});
    await assert.rejects(()=>send('recipient@example.test','d'.repeat(64)),{message:'Recovery delivery failed'});
    assert.ok(commands.some(command=>command.startsWith('STARTTLS')));
    assert.ok(!commands.some(command=>command.startsWith('AUTH')||command.startsWith('MAIL')||command.includes('d'.repeat(64))));
    assert.deepEqual(logs,['STICH BILL recovery delivery failed']);
  }finally{logging.mock.restore();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
});

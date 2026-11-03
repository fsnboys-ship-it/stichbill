// Ephemeral native Linux PostgreSQL only; no application or production database.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
if(process.env.CI!=='true'||process.platform!=='linux'||!process.env.RUNNER_TEMP)throw new Error('Linux hosted CI only');
const root=join(process.env.RUNNER_TEMP,'stichbill-postgres'),bin='/usr/lib/postgresql/17/bin';
function run(command,args,env=process.env){const result=spawnSync(join(bin,command),args,{stdio:'inherit',env});if(result.error||result.status!==0)throw new Error(`Native PostgreSQL ${command} failed`);}
if(process.argv.includes('--stop')){
 try{await readFile(join(root,'data','postmaster.pid'));run('pg_ctl',['-D',join(root,'data'),'-m','fast','-w','stop']);}catch(error){if(error.code!=='ENOENT')throw error;}
}else{
 await mkdir(root,{mode:0o700});const password=randomBytes(32).toString('hex'),passfile=join(root,'password');await writeFile(passfile,password,{flag:'wx',mode:0o600});
 run('initdb',['-D',join(root,'data'),'-U','stichbill_test','--pwfile='+passfile,'--auth=scram-sha-256','--encoding=UTF8','--locale=C.UTF-8']);
 run('pg_ctl',['-D',join(root,'data'),'-l',join(root,'server.log'),'-o',`-h 127.0.0.1 -p 55432 -k ${root}`,'-w','start']);
 run('createdb',['-h','127.0.0.1','-p','55432','-U','stichbill_test','stichbill_test'],{...process.env,PGPASSWORD:password});
 await writeFile('.env.ci-admin',`ADMIN_DATABASE_URL=postgresql://stichbill_test:${password}@127.0.0.1:55432/stichbill_test\n`,{flag:'wx',mode:0o600});
}

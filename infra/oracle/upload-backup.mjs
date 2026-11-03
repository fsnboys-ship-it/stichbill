// Install ONLY on the separate uploader host. Never on the API/database host.
import { readFile, lstat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { uploadVerifiedBundle } from './backup.mjs';
try {
  if(process.env.STICHBILL_ENABLE_UPLOADS !== 'yes' || !process.argv.includes('--approved-isolated-uploader')) throw new Error('Disabled');
  // PID 1 reads the root-only acceptance record and hands the service a private credential.
  if(process.env.CREDENTIALS_DIRECTORY !== '/run/credentials/stichbill-upload.service')throw new Error('Systemd credential handoff required');
  const approval=process.env.CREDENTIALS_DIRECTORY+'/uploader-isolation.json', stat=await lstat(approval);
  if(!stat.isFile() || stat.isSymbolicLink() || ![0,process.getuid()].includes(stat.uid) || (stat.mode & 0o077))throw new Error('Invalid approval');
  const proof=JSON.parse(await readFile(approval,'utf8'));
  if(!/^ocid1\.instance\./.test(proof.uploaderInstanceId) || !/^ocid1\.instance\./.test(proof.apiInstanceId) || proof.apiInstanceId===proof.uploaderInstanceId ||
      !/^[a-zA-Z0-9_-]+$/.test(proof.namespace) || !/^[a-zA-Z0-9_.-]+$/.test(proof.bucket) ||
      !Number.isFinite(Date.parse(proof.expiresAt)) || Date.parse(proof.expiresAt)<=Date.now())throw new Error('Invalid approval');
  const metadata=await fetch('http://169.254.169.254/opc/v2/instance/id',{headers:{Authorization:'Bearer Oracle'},signal:AbortSignal.timeout(3000)});
  if(!metadata.ok || (await metadata.text()).trim()!==proof.uploaderInstanceId)throw new Error('Wrong host');
  await uploadVerifiedBundle({bundle:process.env.STICHBILL_BUNDLE ?? '',scratch:'/var/lib/stichbill-upload',approved:true,
    put:async({file,name,sha256})=>{await promisify(execFile)('/usr/local/bin/oci',['os','object','put','--auth','instance_principal','--namespace-name',proof.namespace,'--bucket-name',proof.bucket,'--name',name,'--file',file,'--no-multipart','--if-none-match','*','--force','--opc-checksum-algorithm','SHA256','--opc-content-sha256',sha256],{timeout:300000,maxBuffer:1048576});}});
  console.log('Verified backup object upload completed');
} catch {console.error('Backup upload disabled or failed; reconcile any uncertain remote outcome before retry');process.exitCode=1;}

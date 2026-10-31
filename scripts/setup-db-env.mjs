import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { separateEnvironment, verifySeparation } from './env-separation.mjs';
export async function rewriteEnvironment(root=new URL('../',import.meta.url)) {
  const runtimePath=new URL('.env',root),adminPath=new URL('.env.db',root);
  const suffix=randomBytes(8).toString('hex');
  const runtimeTemp=new URL(`.env.runtime-${suffix}`,root),adminTemp=new URL(`.env.admin-${suffix}`,root);
  try {
    const source=await readFile(runtimePath,'utf8');
    let existing='';try{existing=await readFile(adminPath,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
    const {runtimeText,adminText}=separateEnvironment(source,existing);
    // Verify both staged files before replacing either. Write administrative settings first so
    // interruption cannot lose the original admin credential. A rerun preserves existing roles.
    await writeFile(adminTemp,adminText,{flag:'wx',mode:0o600});
    await writeFile(runtimeTemp,runtimeText,{flag:'wx',mode:0o600});
    verifySeparation(await readFile(runtimeTemp,'utf8'),await readFile(adminTemp,'utf8'));
    await rename(adminTemp,adminPath);
    await rename(runtimeTemp,runtimePath);
    verifySeparation(await readFile(runtimePath,'utf8'),await readFile(adminPath,'utf8'));
  } finally {await Promise.all([rm(runtimeTemp,{force:true}),rm(adminTemp,{force:true})]);}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  rewriteEnvironment().then(()=>console.log('Verified local credential separation. Runtime contains only restricted application settings.')).catch(()=>{
    console.error('Environment separation failed. Review supported keys, local URLs, role names and private file permissions. Credentials are not logged; do not start the API until separation succeeds.');
    process.exitCode=1;
  });
}

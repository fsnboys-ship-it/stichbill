// Recovery host only. This verifies/decrypts a local file; NEVER runs pg_restore.
import { decryptVerifiedBundle } from './backup.mjs';
try {
  if(process.env.STICHBILL_ENABLE_RESTORE_PREPARATION !== 'isolated-staging-only')throw new Error('Approval required');
  const dump=await decryptVerifiedBundle({bundle:process.env.STICHBILL_BUNDLE ?? '',identity:process.env.STICHBILL_RECOVERY_IDENTITY ?? '',outputDirectory:process.env.STICHBILL_RECOVERY_DIR ?? ''});
  console.log('Authenticated local restore input (still requires reviewed pg_restore):',dump);
} catch {console.error('Restore preparation failed; no restore input released');process.exitCode=1;}

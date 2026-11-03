import { createEncryptedBackup } from './backup.mjs';
try {
  const artifact=await createEncryptedBackup({root:'/var/lib/stichbill-backup',recipients:'/etc/stichbill/backup-recipients.txt',release:process.env.STICHBILL_RELEASE_SHA ?? ''});
  console.log('Encrypted backup ready for isolated transfer:',artifact);
} catch {console.error('Encrypted backup failed; nothing ready for transfer');process.exitCode=1;}

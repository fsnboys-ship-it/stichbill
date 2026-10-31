// Only ephemeral CI databases. Generated credentials stay in ignored files.
import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateLocalDatabaseUrl } from '../apps/api/dist/config.js';
if (process.env.CI !== 'true') throw new Error('CI setup only');
const admin=new URL(validateLocalDatabaseUrl(process.env.ADMIN_DATABASE_URL ?? ''));
if(admin.pathname!=='/stichbill_test') throw new Error('CI requires the isolated test database');
const runtime=new URL(admin), migrator=new URL(admin);
runtime.username='stichbill_test_runtime'; runtime.password=randomBytes(24).toString('hex');
migrator.username='stichbill_test_migrator'; migrator.password=randomBytes(24).toString('hex');
for(const path of ['.env','.env.test']) await writeFile(path,`APP_ENV=test\nDATABASE_URL=${runtime.href}\n`,{flag:'wx',mode:0o600});
await writeFile('.env.test.db',`ADMIN_DATABASE_URL=${admin.href}\nMIGRATION_DATABASE_URL=${migrator.href}\n`,{flag:'wx',mode:0o600});
const result=spawnSync(process.execPath,['scripts/provision-local-db.mjs'],{stdio:'inherit',env:{...process.env,DATABASE_URL:runtime.href,MIGRATION_DATABASE_URL:migrator.href}});
if(result.error) throw result.error;
process.exitCode=result.status ?? 1;

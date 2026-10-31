// Explicit local CLI only; install/start/test never invoke this wrapper implicitly.
import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['apps/api/dist/database/migrate.js','--approve-local-migrations'], {
  env: { ...process.env, ALLOW_MIGRATIONS: 'true' }, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

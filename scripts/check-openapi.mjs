import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const paths = ['packages/api-client/openapi.json', 'packages/api-client/src/schema.d.ts'];
const before = await Promise.all(paths.map(p => readFile(p, 'utf8')));
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'openapi:generate'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
const after = await Promise.all(paths.map(p => readFile(p, 'utf8')));
if (before.some((s, i) => s !== after[i])) { console.error('OpenAPI artifacts were stale. Review and commit generated changes.'); process.exitCode = 1; }
else console.log('OpenAPI contract and typed client are current.');

import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const suite = process.argv[2];
if (!['unit', 'integration'].includes(suite)) throw new Error('Choose unit or integration');
const files = (await readdir(`tests/${suite}`)).filter(f => f.endsWith('.test.mjs')).map(f => `tests/${suite}/${f}`);
if (!files.length) throw new Error('No tests discovered');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

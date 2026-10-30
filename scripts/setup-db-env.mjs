// Explicit one-time upgrade from the health-only setup. Never prints credentials.
import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
const root = new URL('../', import.meta.url);
try { await access(new URL('.env.db', root)); throw new Error('.env.db already exists; preserved. Use the documented manual setup for changes.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const source = await readFile(new URL('.env', root), 'utf8');
const env = parseEnv(source);
const admin = new URL(env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(admin.hostname) || !['/stichbill_dev', '/stichbill_test'].includes(admin.pathname) || admin.search || admin.hash || !['postgres:', 'postgresql:'].includes(admin.protocol)) throw new Error('Only the dedicated local development/test database may be configured.');
const database = admin.pathname.slice(1);
const runtime = new URL(admin); runtime.username = `${database}_runtime`; runtime.password = randomBytes(24).toString('hex');
const migrator = new URL(admin); migrator.username = `${database}_migrator`; migrator.password = randomBytes(24).toString('hex');
const compose = ['POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_DB','POSTGRES_PORT'].filter(key => env[key]).map(key => `${key}=${env[key]}`).join('\n');
await writeFile(new URL('.env.db', root), `# Administrative CLI only. Never load into API/web/worker.\nADMIN_DATABASE_URL=${admin.href}\nMIGRATION_DATABASE_URL=${migrator.href}\n${compose}\n`, { flag: 'wx', mode: 0o600 });
await writeFile(new URL('.env', root), source.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${runtime.href}`).replace(/^POSTGRES_(USER|PASSWORD|DB|PORT)=.*\r?\n/gm,''), { mode: 0o600 });
console.log('Separated local runtime and administrative configuration. Run db:provision next. Existing databases/roles have not been changed.');

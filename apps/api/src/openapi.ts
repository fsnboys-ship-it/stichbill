import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from './app.js';
// Generation constructs metadata only; it does not listen or query PostgreSQL.
async function main() {
  const { app, document } = await createApp({ APP_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 3001,
    DATABASE_URL: 'postgresql://schema:metadata-only@127.0.0.1:5432/stichbill_test', ALLOW_MIGRATIONS: 'false' }, { logger: false });
  try {
    await mkdir(resolve('packages/api-client'), { recursive: true });
    await writeFile(resolve('packages/api-client/openapi.json'), JSON.stringify(document, null, 2) + '\n');
  } finally { await app.close(); }
}
main().catch(() => { console.error('OpenAPI generation failed'); process.exitCode = 1; });

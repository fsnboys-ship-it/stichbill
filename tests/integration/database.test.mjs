import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'kysely';
import { readConfig } from '../../apps/api/dist/config.js';
import { createDatabase, probeDatabase } from '../../apps/api/dist/database/connection.js';
import { createApp } from '../../apps/api/dist/app.js';
const config = readConfig({ ...process.env, APP_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL });
test('Kysely reaches local PostgreSQL with SELECT only; no tables or migrations', async () => {
  const db = createDatabase(config.DATABASE_URL);
  try {
    await probeDatabase(db);
    const { rows } = await sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`.execute(db);
    assert.deepEqual(rows, [], 'Task 002 development database must have no application or migration tables');
  } finally { await db.destroy(); }
});
test('real API readiness probes the isolated local PostgreSQL service', async () => {
  const { app } = await createApp(config, { logger: false });
  await app.init(); await app.getHttpAdapter().getInstance().ready();
  try { const response = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    assert.equal(response.statusCode, 200); assert.equal(response.json().database, 'up');
  } finally { await app.close(); }
});

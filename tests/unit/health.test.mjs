import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../apps/api/dist/app.js';
const config = { APP_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 3001,
  DATABASE_URL: 'postgresql://unit:test-only@127.0.0.1:5432/stichbill_test', ALLOW_MIGRATIONS: 'false' };
async function start(probe) {
  const result = await createApp(config, { probe, logger: false });
  await result.app.init(); await result.app.getHttpAdapter().getInstance().ready();
  return result;
}
test('liveness does not query the database', async () => {
  let calls = 0;
  const { app } = await start(async () => { calls++; throw new Error('offline'); });
  try { const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    assert.equal(response.statusCode, 200); assert.equal(response.json().service, 'stichbill-api'); assert.equal(calls, 0);
  } finally { await app.close(); }
});
test('readiness executes probe and reports up', async () => {
  let calls = 0;
  const { app } = await start(async () => { calls++; });
  try { const response = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    assert.equal(response.statusCode, 200); assert.equal(response.json().database, 'up'); assert.equal(calls, 1);
  } finally { await app.close(); }
});
test('database failure is 503 without exposing connection details', async () => {
  const { app } = await start(async () => { throw new Error('password=sensitive-value'); });
  try { const response = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    assert.equal(response.statusCode, 503); assert.equal(response.json().message, 'Database unavailable'); assert.ok(!response.body.includes('sensitive-value'));
  } finally { await app.close(); }
});
test('OpenAPI describes both health operations and no retail endpoints', async () => {
  const { app, document } = await start(async () => {});
  try { assert.deepEqual(Object.keys(document.paths).sort(), ['/api/v1/health', '/api/v1/health/ready']);
    assert.equal(document.paths['/api/v1/health'].get.operationId, 'getHealth');
    assert.ok(document.paths['/api/v1/health/ready'].get.responses['503']);
  } finally { await app.close(); }
});

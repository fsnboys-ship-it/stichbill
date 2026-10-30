import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig, validateLocalDatabaseUrl } from '../../apps/api/dist/config.js';
const local = 'postgresql://tester:test-only@127.0.0.1:5432/stichbill_test';
test('accepts valid local configuration and typed port', () => {
  assert.equal(readConfig({ DATABASE_URL: local, API_PORT: '3100' }).API_PORT, 3100);
});
for (const [name, values] of [
  ['missing database URL', {}], ['production mode', { DATABASE_URL: local, APP_ENV: 'production' }],
  ['public bind address', { DATABASE_URL: local, API_HOST: '0.0.0.0' }],
  ['invalid port', { DATABASE_URL: local, API_PORT: 'nope' }],
  ['unrecognised migration flag', { DATABASE_URL: local, ALLOW_MIGRATIONS: 'yes' }],
]) test(`rejects ${name}`, () => assert.throws(() => readConfig(values)));
for (const url of [
  'postgresql://user:secret@production.example.com/stichbill_dev',
  'postgresql://user:secret@localhost/production',
  'postgresql://user:secret@127.0.0.1/stichbill_dev?host=production.example.com',
  'https://user:secret@localhost/stichbill_dev',
  'postgresql://user:replace-with-local-password@localhost/stichbill_dev',
]) test('rejects unsafe database configuration without echoing credentials', () => {
  assert.throws(() => validateLocalDatabaseUrl(url), error => !error.message.includes('secret'));
});

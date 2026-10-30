import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SqlMigrationProvider } from '../../apps/api/dist/database/migrate.js';
test('reviewed access migration is discoverable; provider only inspects files', async () => {
  assert.deepEqual(Object.keys(await new SqlMigrationProvider(resolve('database/migrations')).getMigrations()), ['20261031000100_access_foundation.sql']);
});
test('provider orders reviewed names and rejects ambiguous naming; no SQL executes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stich-migration-test-'));
  try {
    await writeFile(join(directory, '20261030000100_second.sql'), '-- fixture only');
    await writeFile(join(directory, '20261030000000_first.sql'), '-- fixture only');
    const provider = new SqlMigrationProvider(directory);
    assert.deepEqual(Object.keys(await provider.getMigrations()), ['20261030000000_first.sql', '20261030000100_second.sql']);
    await writeFile(join(directory, 'bad.sql'), '-- fixture only');
    await assert.rejects(() => provider.getMigrations(), /Migration names/);
  } finally { await rm(directory, { recursive: true }); }
});

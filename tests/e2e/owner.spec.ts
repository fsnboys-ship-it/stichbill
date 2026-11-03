import { test, expect } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import pg from 'pg';

test.use({ trace: 'off' });

test('mobile owner registration, setup, sign-out, sign-in and password recovery', async ({ page }) => {
  const email = `${randomUUID()}@example.test`;
  const password = 'Synthetic-browser-password-123';
  const newPassword = 'Synthetic-browser-password-456';
    const env = parseEnv(await readFile('.env.test.db', 'utf8'));
    const url = env.MIGRATION_DATABASE_URL;
    if (!url || new URL(url).pathname !== '/stichbill_test') throw new Error('Browser cleanup requires isolated test database');
  const setup = new pg.Client({ connectionString: url }); await setup.connect();
  try {
    const keys = ['login', 'register', 'recover', 'reset'].flatMap(op => [op + ':ip:127.0.0.1', op + ':account:127.0.0.1']).map(value => createHash('sha256').update(value).digest('hex'));
    await setup.query('DELETE FROM auth.attempt_buckets WHERE key_hash=ANY($1::text[])', [keys]);
  } finally { await setup.end(); }
  await page.setViewportSize({ width: 360, height: 740 });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create owner account', exact: true }).click();
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();
    await page.getByLabel('Business name').fill('Synthetic Browser Shop');
    await page.getByLabel('Your name').fill('Synthetic Owner');
    await page.getByRole('button', { name: 'Create business', exact: true }).click();
    await expect(page.getByText('Synthetic Browser Shop', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const cookies = await page.context().cookies();
    for (const cookie of cookies.filter(c => c.name.startsWith('__Host-stich-'))) {
      expect(cookie.secure).toBe(true); expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Strict');
    }
    expect(await page.evaluate(() => document.cookie)).not.toContain('__Host-stich-session');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Synthetic Browser Shop', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send recovery instructions' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'If an account can be recovered' })).toBeVisible();
    const mailbox = 'work/local-mailbox';
    let resetUrl = '';
    for (const file of await readdir(mailbox)) {
      const mail = JSON.parse(await readFile(`${mailbox}/${file}`, 'utf8')) as {to: string; resetUrl: string};
      if (mail.to === email) { resetUrl = mail.resetUrl; await unlink(`${mailbox}/${file}`); }
    }
    expect(Boolean(resetUrl)).toBe(true);
    await page.goto(resetUrl);
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await expect.poll(() => page.url().includes('#reset=')).toBe(false);
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Change password', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Synthetic Browser Shop', { exact: true })).toBeVisible();
  } finally {
    await page.evaluate(() => document.querySelectorAll<HTMLInputElement>('input[type=password]').forEach(input => { input.value = ''; })).catch(() => {});
    const client = new pg.Client({ connectionString: url }); await client.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT id FROM auth.identity_accounts WHERE normalised_email=$1', [email]);
      if (rows[0]) {
        const identity = rows[0].id as string;
        const tenants = await client.query('SELECT tenant_id FROM public.memberships WHERE identity_id=$1', [identity]);
        for (const tenant of tenants.rows) {
          for (const table of ['membership_sessions', 'membership_roles', 'membership_scopes', 'memberships', 'roles']) await client.query(`DELETE FROM public.${table} WHERE tenant_id=$1`, [tenant.tenant_id]);
          await client.query('DELETE FROM public.tenants WHERE id=$1', [tenant.tenant_id]);
        }
        for (const table of ['password_resets', 'identity_sessions']) await client.query(`DELETE FROM auth.${table} WHERE identity_id=$1`, [identity]);
        await client.query('DELETE FROM auth.identity_accounts WHERE id=$1', [identity]);
      }
      await client.query('COMMIT');
    } finally { await client.end(); }
  }
});

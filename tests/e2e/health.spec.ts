import { test, expect } from '@playwright/test';
test('frontend shows actual API status and refreshes', async ({ page, request }) => {
  const response = await request.get('/api/v1/health');
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).status).toBe('ok');
  await page.goto('/');
  await expect(page.getByTestId('api-status')).toHaveText('Connected');
  await expect(page.getByTestId('db-status')).toHaveText(process.env.EXPECT_DATABASE_DOWN === 'true' ? 'Unavailable' : 'Connected');
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('button', { name: 'Check again' })).toBeEnabled();
  await expect(page.getByTestId('api-status')).toHaveText('Connected');
});
test('frontend reports API outage rather than a hardcoded healthy state', async ({ page }) => {
  await page.route('**/api/v1/health**', route => route.abort());
  await page.goto('/');
  await expect(page.getByTestId('api-status')).toHaveText('Unavailable');
  await expect(page.getByTestId('db-status')).toHaveText('Unavailable');
});
test('status view fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Development foundation' })).toBeVisible();
  await expect(page.getByTestId('api-status')).toHaveText('Connected');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

import { expect, test } from '@playwright/test';
import { readSeedState } from './support/seedState';

test.use({ storageState: { cookies: [], origins: [] } });

test('redirects unauthenticated users to login and accepts token callback auth', async ({ page }) => {
  const seed = readSeedState();

  await page.goto('/tasks');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('login-twitch-button')).toBeVisible();

  await page.goto(`/auth/callback?token=${encodeURIComponent(seed.token)}`);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

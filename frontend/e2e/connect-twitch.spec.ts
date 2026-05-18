import { expect, test } from '@playwright/test';

test('renders the connect-twitch route for authenticated users', async ({ page }) => {
  await page.goto('/connect-twitch');

  await expect(page.getByTestId('connect-twitch-page')).toBeVisible();
  await expect(page.getByTestId('connect-twitch-button')).toBeVisible();
});

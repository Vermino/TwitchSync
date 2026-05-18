import { expect, test } from '@playwright/test';
import { readSeedState } from './support/seedState';

test('starts bulk verification and toggles protection for a seeded file', async ({ page }) => {
  const seed = readSeedState();

  await page.goto('/storage');

  await expect(page.getByTestId('storage-dashboard')).toBeVisible();

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/lifecycle/verification/bulk-verify') &&
      response.request().method() === 'POST' &&
      response.status() === 202
    ),
    page.getByTestId('storage-verify-all').click(),
  ]);

  await page.getByRole('tab', { name: 'File Management' }).click();
  await expect(page.getByText(seed.fixtures.seededVodTitle)).toBeVisible();

  const protectButton = page.getByTestId(`storage-protect-file-${seed.fixtures.seededVodId}`);

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/lifecycle/vods/${seed.fixtures.seededVodId}/protect`) &&
      response.request().method() === 'POST' &&
      response.status() === 200
    ),
    protectButton.click(),
  ]);
  await expect(protectButton).toBeVisible();

  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes(`/api/lifecycle/vods/${seed.fixtures.seededVodId}/protect`) &&
      response.request().method() === 'DELETE' &&
      response.status() === 200
    ),
    protectButton.click(),
  ]);
  await expect(protectButton).toBeVisible();
});

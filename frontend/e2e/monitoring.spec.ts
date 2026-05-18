import { expect, test } from '@playwright/test';
import { readSeedState } from './support/seedState';

test('renders task monitoring data from the live API', async ({ page }) => {
  const seed = readSeedState();

  await page.goto(`/tasks/${seed.fixtures.seededTaskId}/monitoring`);

  await expect(page.getByTestId('task-monitoring-page')).toBeVisible();
  await expect(page.getByTestId('task-monitoring-health')).toContainText('HEALTHY');
  await expect(page.getByText('100.0%').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Alerts' }).click();
  await expect(page.getByText('No active alerts for this task.')).toBeVisible();
});

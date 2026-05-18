import { expect, test, type Page } from '@playwright/test';
import { readSeedState } from './support/seedState';

async function selectRadixOption(page: Page, triggerTestId: string, optionName: string) {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

async function getTaskCard(page: Page, taskName: string) {
  return page.locator('[data-testid^="task-card-"]').filter({ hasText: taskName }).first();
}

test('renders seeded VOD and download history for the fixture task', async ({ page }) => {
  const seed = readSeedState();

  await page.goto('/tasks');
  const seededTaskCard = await getTaskCard(page, seed.fixtures.seededTaskName);
  await expect(seededTaskCard).toBeVisible();

  const toggle = seededTaskCard.locator('[data-testid^="task-card-toggle-"]').first();
  await toggle.click();

  await expect(page.getByText(seed.fixtures.seededVodTitle)).toBeVisible();
  await seededTaskCard.locator('[data-testid^="task-history-tab-"]').click();
  const historyItem = page.locator('[data-testid^="download-history-item-"]').filter({
    hasText: seed.fixtures.seededVodTitle,
  }).first();
  await expect(historyItem).toBeVisible();
  await expect(historyItem.getByText('completed', { exact: true })).toBeVisible();
});

test('creates and edits a task with settings, conditions, and restrictions', async ({ page }) => {
  const seed = readSeedState();
  const taskName = `${seed.fixtures.createdTaskPrefix} ${Date.now()}`;
  const updatedTaskName = `${taskName} Updated`;

  await page.goto('/tasks');
  await page.getByTestId('task-create-button').click();
  await expect(page.getByTestId('task-modal')).toBeVisible();

  await page.getByTestId('task-name-input').fill(taskName);
  await page.getByTestId('task-description-input').fill('Browser E2E task coverage');

  await page.getByTestId('task-channels-search').fill(seed.fixtures.channelName);
  await page.getByRole('button', { name: new RegExp(seed.fixtures.channelName, 'i') }).click();

  await page.getByTestId('task-tab-games').click();
  await page.getByTestId('task-games-search').fill(seed.fixtures.gameName);
  await page.getByRole('button', { name: new RegExp(seed.fixtures.gameName, 'i') }).click();

  await page.getByTestId('task-tab-settings').click();
  const modalBox = await page.getByTestId('task-modal').boundingBox();
  const cancelBox = await page.getByTestId('task-modal-cancel').boundingBox();
  const submitBox = await page.getByTestId('task-modal-submit').boundingBox();

  expect(modalBox).not.toBeNull();
  expect(cancelBox).not.toBeNull();
  expect(submitBox).not.toBeNull();
  expect(cancelBox!.y + cancelBox!.height).toBeLessThanOrEqual(modalBox!.y + modalBox!.height);
  expect(submitBox!.y + submitBox!.height).toBeLessThanOrEqual(modalBox!.y + modalBox!.height);

  await selectRadixOption(page, 'task-schedule-type-trigger', 'Interval');
  await page.getByTestId('task-schedule-value-input').fill('1800');
  await selectRadixOption(page, 'task-priority-trigger', 'High');
  await selectRadixOption(page, 'task-quality-trigger', '720p');
  await page.getByTestId('task-storage-limit-input').fill('3');
  await page.getByTestId('task-retention-days-input').fill('21');
  await page.getByTestId('task-auto-delete-checkbox').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.getByTestId('task-tab-conditions').click();
  await page.getByTestId('task-min-followers-input').fill('1000');
  await page.getByTestId('task-min-views-input').fill('25');
  await page.getByTestId('task-min-duration-input').fill('45');
  await selectRadixOption(page, 'task-languages-trigger', 'English');

  await page.getByTestId('task-tab-restrictions').click();
  await page.getByTestId('task-max-vods-per-channel-input').fill('2');
  await page.getByTestId('task-max-storage-per-channel-input').fill('4');
  await page.getByTestId('task-max-total-vods-input').fill('6');
  await page.getByTestId('task-max-total-storage-input').fill('12');

  await page.getByTestId('task-modal-submit').click();
  await expect(page.getByTestId('task-modal')).toBeHidden();

  let createdTaskCard = await getTaskCard(page, taskName);
  await expect(createdTaskCard).toBeVisible();

  await createdTaskCard.getByLabel(`Edit task ${taskName}`).click();
  await expect(page.getByTestId('task-modal')).toBeVisible();
  await expect(page.getByTestId('task-name-input')).toHaveValue(taskName);

  await page.getByTestId('task-tab-settings').click();
  await expect(page.getByTestId('task-schedule-value-input')).toHaveValue('1800');
  await expect(page.getByTestId('task-retention-days-input')).toHaveValue('21');
  await expect(page.getByTestId('task-quality-trigger')).toContainText('720p');

  await page.getByTestId('task-tab-conditions').click();
  await expect(page.getByTestId('task-min-followers-input')).toHaveValue('1000');

  await page.getByTestId('task-tab-restrictions').click();
  await expect(page.getByTestId('task-max-total-storage-input')).toHaveValue('12');

  await page.getByTestId('task-name-input').fill(updatedTaskName);
  await page.getByTestId('task-modal-submit').click();
  await expect(page.getByTestId('task-modal')).toBeHidden();

  await page.reload();

  createdTaskCard = await getTaskCard(page, updatedTaskName);
  await expect(createdTaskCard).toBeVisible();
  await createdTaskCard.getByLabel(`Edit task ${updatedTaskName}`).click();

  await expect(page.getByTestId('task-name-input')).toHaveValue(updatedTaskName);
  await page.getByTestId('task-tab-settings').click();
  await expect(page.getByTestId('task-quality-trigger')).toContainText('720p');
  await page.getByTestId('task-tab-conditions').click();
  await expect(page.getByTestId('task-min-followers-input')).toHaveValue('1000');
});

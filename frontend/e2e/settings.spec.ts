import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

async function selectNativeOption(page: Page, testId: string, value: string) {
  await page.getByTestId(testId).selectOption(value);
}

async function setCheckbox(locator: Locator, checked: boolean) {
  if ((await locator.isChecked()) !== checked) {
    await locator.click();
  }
}

async function expectCheckbox(locator: Locator, checked: boolean) {
  if (checked) {
    await expect(locator).toBeChecked();
  } else {
    await expect(locator).not.toBeChecked();
  }
}

async function saveSettingsAndWait(page: Page) {
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/settings/system') &&
      response.request().method() === 'POST' &&
      response.status() === 200
    ),
    page.getByTestId('settings-save-button').click(),
  ]);
}

function buildBrowseResponse(targetPath: string | null) {
  if (targetPath === '/mock/library') {
    return {
      path: '/mock/library',
      parent: '/mock',
      entries: [],
      separator: '/',
    };
  }

  return {
    path: '/mock',
    parent: '/',
    entries: [
      {
        name: 'library',
        path: '/mock/library',
        type: 'directory',
      },
    ],
    separator: '/',
  };
}

async function handleBrowseRoute(route: Route) {
  const url = new URL(route.request().url());
  const requestedPath = url.searchParams.get('path');

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(buildBrowseResponse(requestedPath)),
  });
}

test('persists key download settings across save and reload', async ({ page }) => {
  await page.goto('/settings');

  const concurrentInput = page.getByTestId('settings-concurrent-download-limit');
  const bandwidthInput = page.getByTestId('settings-bandwidth-throttle');
  const tempStorageInput = page.getByTestId('settings-temp-storage');
  const defaultQualitySelect = page.getByTestId('settings-default-quality');

  const originalConcurrent = await concurrentInput.inputValue();
  const originalBandwidth = await bandwidthInput.inputValue();
  const originalTempStorage = await tempStorageInput.inputValue();
  const originalQuality = await defaultQualitySelect.inputValue();

  const nextConcurrent = originalConcurrent === '3' ? '4' : '3';
  const nextBandwidth = originalBandwidth === '0' ? '600' : '0';
  const nextTempStorage = originalTempStorage === '/tmp/twitchsync-e2e'
    ? '/tmp/twitchsync-e2e-alt'
    : '/tmp/twitchsync-e2e';
  const nextQuality = originalQuality === '720p' ? 'source' : '720p';

  try {
    await concurrentInput.fill(nextConcurrent);
    await bandwidthInput.fill(nextBandwidth);
    await tempStorageInput.fill(nextTempStorage);
    await selectNativeOption(page, 'settings-default-quality', nextQuality);

    await saveSettingsAndWait(page);
    await page.reload();

    await expect(concurrentInput).toHaveValue(nextConcurrent);
    await expect(bandwidthInput).toHaveValue(nextBandwidth);
    await expect(tempStorageInput).toHaveValue(nextTempStorage);
    await expect(defaultQualitySelect).toHaveValue(nextQuality);
  } finally {
    await concurrentInput.fill(originalConcurrent);
    await bandwidthInput.fill(originalBandwidth);
    await tempStorageInput.fill(originalTempStorage);
    await selectNativeOption(page, 'settings-default-quality', originalQuality);
    await saveSettingsAndWait(page);
  }
});

test('persists broader organization, cleanup, and notification branches across save and reload', async ({ page }) => {
  await page.goto('/settings');

  const filenameTemplateInput = page.getByTestId('settings-filename-template');
  const folderStructureSelect = page.getByTestId('settings-folder-structure');
  const createDateFoldersCheckbox = page.getByTestId('settings-create-date-folders');
  const createChannelFoldersCheckbox = page.getByTestId('settings-create-channel-folders');
  const createGameFoldersCheckbox = page.getByTestId('settings-create-game-folders');
  const metadataFormatSelect = page.getByTestId('settings-metadata-format');
  const autoCleanupCheckbox = page.getByTestId('settings-enable-auto-cleanup');
  const cleanupThresholdInput = page.getByTestId('settings-cleanup-threshold-gb');
  const minAgeInput = page.getByTestId('settings-min-age-for-cleanup-days');
  const keepMetadataCheckbox = page.getByTestId('settings-keep-metadata-on-cleanup');
  const emailNotificationsCheckbox = page.getByTestId('settings-enable-email-notifications');
  const desktopNotificationsCheckbox = page.getByTestId('settings-enable-desktop-notifications');
  const discordWebhookCheckbox = page.getByTestId('settings-enable-discord-webhook');
  const notifyOnStartCheckbox = page.getByTestId('settings-notify-on-download-start');
  const notifyOnCompleteCheckbox = page.getByTestId('settings-notify-on-download-complete');
  const notifyOnErrorCheckbox = page.getByTestId('settings-notify-on-error');
  const notifyOnStorageCheckbox = page.getByTestId('settings-notify-on-storage-alert');

  const original = {
    filenameTemplate: await filenameTemplateInput.inputValue(),
    folderStructure: await folderStructureSelect.inputValue(),
    createDateFolders: await createDateFoldersCheckbox.isChecked(),
    createChannelFolders: await createChannelFoldersCheckbox.isChecked(),
    createGameFolders: await createGameFoldersCheckbox.isChecked(),
    metadataFormat: await metadataFormatSelect.inputValue(),
    autoCleanup: await autoCleanupCheckbox.isChecked(),
    cleanupThreshold: await cleanupThresholdInput.inputValue(),
    minAge: await minAgeInput.inputValue(),
    keepMetadata: await keepMetadataCheckbox.isChecked(),
    emailNotifications: await emailNotificationsCheckbox.isChecked(),
    emailAddress: (await emailNotificationsCheckbox.isChecked())
      ? await page.getByTestId('settings-email-address').inputValue()
      : '',
    desktopNotifications: await desktopNotificationsCheckbox.isChecked(),
    discordWebhook: await discordWebhookCheckbox.isChecked(),
    discordWebhookUrl: (await discordWebhookCheckbox.isChecked())
      ? await page.getByTestId('settings-discord-webhook-url').inputValue()
      : '',
    notifyOnStart: await notifyOnStartCheckbox.isChecked(),
    notifyOnComplete: await notifyOnCompleteCheckbox.isChecked(),
    notifyOnError: await notifyOnErrorCheckbox.isChecked(),
    notifyOnStorage: await notifyOnStorageCheckbox.isChecked(),
  };

  const next = {
    filenameTemplate: original.filenameTemplate === '{date}_{channel}_{title}'
      ? '{channel}_{game}_{title}'
      : '{date}_{channel}_{title}',
    folderStructure: original.folderStructure === 'by_channel' ? 'by_date' : 'by_channel',
    createDateFolders: !original.createDateFolders,
    createChannelFolders: !original.createChannelFolders,
    createGameFolders: !original.createGameFolders,
    metadataFormat: original.metadataFormat === 'json' ? 'yaml' : 'json',
    autoCleanup: true,
    cleanupThreshold: original.cleanupThreshold === '50' ? '25' : '50',
    minAge: original.minAge === '30' ? '14' : '30',
    keepMetadata: !original.keepMetadata,
    emailNotifications: true,
    emailAddress: original.emailAddress === 'settings-e2e@example.com'
      ? 'settings-e2e-alt@example.com'
      : 'settings-e2e@example.com',
    desktopNotifications: !original.desktopNotifications,
    discordWebhook: true,
    discordWebhookUrl: original.discordWebhookUrl === 'https://discord.com/api/webhooks/123/settings-e2e'
      ? 'https://discord.com/api/webhooks/123/settings-e2e-alt'
      : 'https://discord.com/api/webhooks/123/settings-e2e',
    notifyOnStart: !original.notifyOnStart,
    notifyOnComplete: !original.notifyOnComplete,
    notifyOnError: !original.notifyOnError,
    notifyOnStorage: !original.notifyOnStorage,
  };

  try {
    await filenameTemplateInput.fill(next.filenameTemplate);
    await selectNativeOption(page, 'settings-folder-structure', next.folderStructure);
    await setCheckbox(createDateFoldersCheckbox, next.createDateFolders);
    await setCheckbox(createChannelFoldersCheckbox, next.createChannelFolders);
    await setCheckbox(createGameFoldersCheckbox, next.createGameFolders);
    await selectNativeOption(page, 'settings-metadata-format', next.metadataFormat);

    await setCheckbox(autoCleanupCheckbox, next.autoCleanup);
    await expect(cleanupThresholdInput).toBeEnabled();
    await expect(minAgeInput).toBeEnabled();
    await expect(keepMetadataCheckbox).toBeEnabled();
    await cleanupThresholdInput.fill(next.cleanupThreshold);
    await minAgeInput.fill(next.minAge);
    await setCheckbox(keepMetadataCheckbox, next.keepMetadata);

    await setCheckbox(emailNotificationsCheckbox, next.emailNotifications);
    await expect(page.getByTestId('settings-email-address')).toBeVisible();
    await page.getByTestId('settings-email-address').fill(next.emailAddress);

    await setCheckbox(desktopNotificationsCheckbox, next.desktopNotifications);

    await setCheckbox(discordWebhookCheckbox, next.discordWebhook);
    await expect(page.getByTestId('settings-discord-webhook-url')).toBeVisible();
    await page.getByTestId('settings-discord-webhook-url').fill(next.discordWebhookUrl);

    await setCheckbox(notifyOnStartCheckbox, next.notifyOnStart);
    await setCheckbox(notifyOnCompleteCheckbox, next.notifyOnComplete);
    await setCheckbox(notifyOnErrorCheckbox, next.notifyOnError);
    await setCheckbox(notifyOnStorageCheckbox, next.notifyOnStorage);

    await saveSettingsAndWait(page);
    await page.reload();

    await expect(filenameTemplateInput).toHaveValue(next.filenameTemplate);
    await expect(folderStructureSelect).toHaveValue(next.folderStructure);
    await expectCheckbox(createDateFoldersCheckbox, next.createDateFolders);
    await expectCheckbox(createChannelFoldersCheckbox, next.createChannelFolders);
    await expectCheckbox(createGameFoldersCheckbox, next.createGameFolders);
    await expect(metadataFormatSelect).toHaveValue(next.metadataFormat);
    await expect(autoCleanupCheckbox).toBeChecked();
    await expect(cleanupThresholdInput).toBeEnabled();
    await expect(cleanupThresholdInput).toHaveValue(next.cleanupThreshold);
    await expect(minAgeInput).toHaveValue(next.minAge);
    await expectCheckbox(keepMetadataCheckbox, next.keepMetadata);
    await expect(emailNotificationsCheckbox).toBeChecked();
    await expect(page.getByTestId('settings-email-address')).toHaveValue(next.emailAddress);
    await expectCheckbox(desktopNotificationsCheckbox, next.desktopNotifications);
    await expect(discordWebhookCheckbox).toBeChecked();
    await expect(page.getByTestId('settings-discord-webhook-url')).toHaveValue(next.discordWebhookUrl);
    await expectCheckbox(notifyOnStartCheckbox, next.notifyOnStart);
    await expectCheckbox(notifyOnCompleteCheckbox, next.notifyOnComplete);
    await expectCheckbox(notifyOnErrorCheckbox, next.notifyOnError);
    await expectCheckbox(notifyOnStorageCheckbox, next.notifyOnStorage);
  } finally {
    await filenameTemplateInput.fill(original.filenameTemplate);
    await selectNativeOption(page, 'settings-folder-structure', original.folderStructure);
    await setCheckbox(createDateFoldersCheckbox, original.createDateFolders);
    await setCheckbox(createChannelFoldersCheckbox, original.createChannelFolders);
    await setCheckbox(createGameFoldersCheckbox, original.createGameFolders);
    await selectNativeOption(page, 'settings-metadata-format', original.metadataFormat);

    await setCheckbox(autoCleanupCheckbox, true);
    await cleanupThresholdInput.fill(original.cleanupThreshold);
    await minAgeInput.fill(original.minAge);
    await setCheckbox(keepMetadataCheckbox, original.keepMetadata);
    await setCheckbox(autoCleanupCheckbox, original.autoCleanup);

    await setCheckbox(emailNotificationsCheckbox, true);
    await page.getByTestId('settings-email-address').fill(original.emailAddress || 'restore@example.com');
    await setCheckbox(emailNotificationsCheckbox, original.emailNotifications);

    await setCheckbox(desktopNotificationsCheckbox, original.desktopNotifications);

    await setCheckbox(discordWebhookCheckbox, true);
    await page.getByTestId('settings-discord-webhook-url').fill(
      original.discordWebhookUrl || 'https://discord.com/api/webhooks/123/restore'
    );
    await setCheckbox(discordWebhookCheckbox, original.discordWebhook);

    await setCheckbox(notifyOnStartCheckbox, original.notifyOnStart);
    await setCheckbox(notifyOnCompleteCheckbox, original.notifyOnComplete);
    await setCheckbox(notifyOnErrorCheckbox, original.notifyOnError);
    await setCheckbox(notifyOnStorageCheckbox, original.notifyOnStorage);

    await saveSettingsAndWait(page);
  }
});

test('opens the file browser, triggers cleanup, and surfaces save failures', async ({ page }) => {
  await page.route('**/api/settings/browse**', handleBrowseRoute);

  let cleanupRequestSeen = false;
  await page.route('**/api/settings/storage/cleanup', async (route) => {
    cleanupRequestSeen = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Storage cleanup completed',
        stats: {
          tempFilesDeleted: 1,
          logFilesDeleted: 0,
          spaceFreedMB: 2,
          databaseEventsDeleted: 0,
          orphanedRecordsDeleted: 0,
          durationMs: 100,
        },
      }),
    });
  });

  let failSave = false;
  await page.route('**/api/settings/system', async (route) => {
    if (route.request().method() === 'POST' && failSave) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to update system settings' }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/settings');

  const downloadPathInput = page.getByTestId('settings-download-path');
  const autoCleanupCheckbox = page.getByTestId('settings-enable-auto-cleanup');
  const concurrentInput = page.getByTestId('settings-concurrent-download-limit');

  const originalDownloadPath = await downloadPathInput.inputValue();
  const originalAutoCleanup = await autoCleanupCheckbox.isChecked();
  const originalConcurrent = await concurrentInput.inputValue();

  try {
    await page.getByTestId('settings-download-path-browse').click();
    await expect(page.getByTestId('file-browser-dialog')).toBeVisible();
    await page.getByTestId('file-browser-entry-library').click();
    await page.getByTestId('file-browser-select-button').click();
    await expect(downloadPathInput).toHaveValue('/mock/library');

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    await setCheckbox(autoCleanupCheckbox, true);
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().includes('/api/settings/storage/cleanup') &&
        response.request().method() === 'POST' &&
        response.status() === 200
      ),
      page.getByTestId('settings-run-cleanup-button').click(),
    ]);

    expect(cleanupRequestSeen).toBe(true);

    failSave = true;
    await concurrentInput.fill(originalConcurrent === '3' ? '4' : '3');
    await page.getByTestId('settings-save-button').click();

    await expect(page.getByTestId('settings-error-banner')).toContainText('Failed to save settings');
  } finally {
    failSave = false;
    await downloadPathInput.fill(originalDownloadPath);
    await concurrentInput.fill(originalConcurrent);
    await setCheckbox(autoCleanupCheckbox, originalAutoCleanup);
    await saveSettingsAndWait(page);
  }
});

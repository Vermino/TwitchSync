import { expect, test } from '@playwright/test';

test('uses enriched channel search results with follower ordering and profile avatars', async ({ page }) => {
  let legacySearchHit = false;
  const popularAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMzIiIGZpbGw9IiNmNTllMGIiLz48dGV4dCB4PSIzMiIgeT0iMzYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNmZmYiIGZvbnQtc2l6ZT0iMjQiPlA8L3RleHQ+PC9zdmc+';
  const smallAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMzIiIGZpbGw9IiMwZWE1ZTkiLz48dGV4dCB4PSIzMiIgeT0iMzYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNmZmYiIGZvbnQtc2l6ZT0iMjQiPlM8L3RleHQ+PC9zdmc+';

  await page.route('**/api/twitch/channels/search**', async (route) => {
    legacySearchHit = true;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'legacy search path should not be used' }),
    });
  });

  await page.route('**/api/channels/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'chan-2',
          twitch_id: 'chan-2',
          username: 'popularcreator',
          display_name: 'Popular Creator',
          profile_image_url: popularAvatar,
          thumbnail_url: smallAvatar,
          description: 'Large audience',
          follower_count: 125000,
          view_count: 2100,
          broadcaster_type: '',
          tags: ['variety'],
          is_live: true,
        },
        {
          id: 'chan-1',
          twitch_id: 'chan-1',
          username: 'smallcreator',
          display_name: 'Small Creator',
          profile_image_url: smallAvatar,
          thumbnail_url: popularAvatar,
          description: 'Smaller audience',
          follower_count: 900,
          view_count: 20000,
          broadcaster_type: '',
          tags: ['indie'],
          is_live: false,
        },
      ]),
    });
  });

  await page.goto('/channels');
  await page.getByTestId('channels-add-button').click();
  await page.getByTestId('channel-search-input').fill('creator');

  const firstResult = page.locator('[data-testid^="channel-search-result-"]').first();
  await expect(firstResult).toContainText('Popular Creator');
  await expect(firstResult).toContainText('125.0K followers');

  const firstAvatar = page.getByTestId('channel-search-avatar-chan-2').locator('img');
  await expect(firstAvatar).toHaveAttribute('src', /data:image\/svg\+xml/);

  expect(legacySearchHit).toBe(false);
});

test('renders channel search results safely when display_name is missing', async ({ page }) => {
  await page.route('**/api/channels/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'chan-missing-name',
          twitch_id: 'chan-missing-name',
          username: 'fallbackusername',
          profile_image_url: '',
          thumbnail_url: '',
          description: 'Missing display name',
          follower_count: 125,
          view_count: 10,
          broadcaster_type: '',
          tags: [],
          is_live: false,
        },
      ]),
    });
  });

  await page.goto('/channels');
  await page.getByTestId('channels-add-button').click();
  await page.getByTestId('channel-search-input').fill('fallback');

  const result = page.getByTestId('channel-search-result-chan-missing-name');
  await expect(result).toContainText('fallbackusername');
  await expect(result).toContainText('@fallbackusername');
});

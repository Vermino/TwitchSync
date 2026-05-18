import { expect, test } from '@playwright/test';

test('renders compact game search results without horizontal overflow', async ({ page }) => {
  await page.route('**/api/twitch/games/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'game-1',
          name: 'Test Drive Unlimited',
          box_art_url: 'https://static-cdn.jtvnw.net/ttv-boxart/Test%20Drive%20Unlimited-{width}x{height}.jpg',
        },
        {
          id: 'game-2',
          name: 'Test Drive Off-Road',
          box_art_url: 'https://static-cdn.jtvnw.net/ttv-boxart/Test%20Drive%20Off-Road-{width}x{height}.jpg',
        },
      ]),
    });
  });

  await page.goto('/games');
  await page.getByTestId('games-add-button').click();
  await page.getByTestId('game-search-input').fill('test');

  const modal = page.getByTestId('game-search-modal');
  const firstResult = page.getByTestId('game-search-result-game-1');
  const art = page.getByTestId('game-search-art-game-1');

  await expect(firstResult).toContainText('Test Drive Unlimited');
  await expect(art).toBeVisible();

  const modalHasHorizontalOverflow = await modal.evaluate((node) => node.scrollWidth > node.clientWidth);
  expect(modalHasHorizontalOverflow).toBe(false);

  const artBox = await art.boundingBox();
  expect(artBox).not.toBeNull();
  expect(artBox!.width).toBeLessThanOrEqual(70);
  expect(artBox!.height).toBeLessThanOrEqual(110);
});

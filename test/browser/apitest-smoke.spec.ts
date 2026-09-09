import { expect, test } from '@playwright/test';

test('loads, saves, and renders the API demo without browser errors', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  await page.goto('/?smoke=1');
  await expect(page.locator('html')).toHaveAttribute(
    'data-strelit-smoke',
    'passed',
  );
  const layoutRoot = page.locator('.lm_strelit.lm_root.lm_item');
  await expect(layoutRoot).toBeVisible();

  await page.locator('#saveLayoutButton').click();
  await expect(page.locator('#reloadSavedLayoutButton')).toBeEnabled();
  await page.locator('#reloadSavedLayoutButton').click();
  await expect(layoutRoot).toBeVisible();

  const initialBox = await layoutRoot.boundingBox();
  await page.setViewportSize({ width: 960, height: 720 });
  await expect
    .poll(async () => (await layoutRoot.boundingBox())?.width)
    .not.toBe(initialBox?.width);
  expect(runtimeErrors).toEqual([]);
});

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

test('workbench edits configuration and runs APIs with visible results', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.goto('/');

  await expect(page.locator('.lm_tab')).toHaveCount(10);
  await expect(page.locator('.lm_tab[title="Overview"]')).toBeVisible();
  await expect(page.locator('.lm_tab[title="Golden"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => typeof window.strelitApiTestExports.StrelitLayout,
    ),
  ).toBe('function');
  await expect(page.locator('#layoutSummary')).toContainText('10 components');
  await expect(page.locator('#apiTargetSelect')).toHaveValue('0');

  await page.selectOption('#apiActionSelect', 'blur');
  await page.locator('#apiRunButton').click();
  await page.selectOption('#apiActionSelect', 'focus');
  await page.locator('#apiRunButton').click();
  const focusedTab = page.locator('.lm_tab.lm_focused');
  await expect(focusedTab).toHaveCount(1);
  const focusedTitle = await focusedTab.getAttribute('title');
  const focusedColor = await focusedTab.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await page.selectOption('#apiActionSelect', 'blur');
  await page.locator('#apiRunButton').click();
  await expect(page.locator('.lm_tab.lm_focused')).toHaveCount(0);
  const blurredTab = page.locator('.lm_tab').filter({ hasText: focusedTitle! });
  expect(
    await blurredTab.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).not.toBe(focusedColor);

  await page.selectOption('#apiActionSelect', 'rename');
  await page.locator('#apiActionValue').fill('Monitor');
  await page.locator('#apiRunButton').click();
  await expect(page.locator('.lm_tab[title="Monitor"]')).toBeVisible();

  await page.selectOption('#apiActionSelect', 'maximize');
  await page.locator('#apiRunButton').click();
  await expect(page.locator('.lm_stack.lm_maximised')).toHaveCount(1);
  await page.locator('#apiRunButton').click();
  await expect(page.locator('.lm_stack.lm_maximised')).toHaveCount(0);

  await page.selectOption('#layoutSelect', 'miniStack');
  await page.locator('#configFromPresetButton').click();
  await page.locator('#applyConfigButton').click();
  await expect(page.locator('.lm_tab')).toHaveCount(2);
  await expect(page.locator('.lm_tab[title="Details"]')).toBeVisible();
  await expect(page.locator('#layoutSummary')).toContainText('2 components');
  await page.locator('#layoutContainer input').first().fill('teal');
  await expect(page.locator('#liveSnapshot')).toContainText(
    '"componentState": "teal"',
  );

  await page.locator('#configEditor').fill('{ invalid');
  await page.locator('#applyConfigButton').click();
  await expect(page.locator('#workbenchStatus')).toHaveClass(/error/);
  await expect(page.locator('.lm_tab')).toHaveCount(2);

  await page.locator('#configFromLiveButton').click();
  await expect(page.locator('#configEditor')).toHaveValue(/"root"/);
  await page.locator('.api-explorer summary').click();
  await expect(page.locator('#apiMethodSelect')).toHaveValue('saveLayout');
  await page.locator('#apiArgsEditor').fill('[{"$ref":"missing"}]');
  await page.locator('#runMethodButton').click();
  await expect(page.locator('#workbenchStatus')).toHaveClass(/error/);
  await expect(page.locator('.lm_tab')).toHaveCount(2);
  await page.locator('#apiArgsEditor').fill('[]');
  await page.locator('#runMethodButton').click();
  await expect(page.locator('#methodResult')).toContainText('"root"');
  await page.selectOption('#apiMethodSelect', 'focusComponent');
  await page.locator('#apiArgsEditor').fill('[{"$ref":"selected"}]');
  await page.locator('#runMethodButton').click();
  await expect(page.locator('#workbenchStatus')).toContainText(
    'focusComponent() completed',
  );
  await page.selectOption('#apiObjectSelect', 'exports');
  await page.selectOption('#apiMethodSelect', 'createLayoutConfigFromResolved');
  await page.locator('#apiArgsEditor').fill('[{"$ref":"saved"}]');
  await page.locator('#runMethodButton').click();
  await expect(page.locator('#methodResult')).toContainText('"root"');
  expect(runtimeErrors).toEqual([]);
});

test('workbench preserves a whole stack through pop-out and pop-in', async ({
  page,
}) => {
  await page.goto('/');
  await page.selectOption('#layoutSelect', 'miniStack');
  await page.locator('#loadLayoutButton').click();
  await page.locator('#layoutContainer input:visible').first().fill('teal');
  await page.selectOption('#apiTargetSelect', '0');
  await page.selectOption('#apiActionSelect', 'popout');
  const [child] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#apiRunButton').click(),
  ]);
  await expect(child.locator('.lm_tab')).toHaveCount(2);
  await expect(child.locator('.lm_tab[title="Overview"]')).toBeVisible();
  await expect(child.locator('.lm_tab[title="Details"]')).toBeVisible();
  await expect(
    child.locator('#layoutContainer input:visible').first(),
  ).toHaveValue('teal');
  await child.locator('.lm_tab[title="Details"]').click();
  await expect(
    child.locator('#layoutContainer input:visible').first(),
  ).toHaveValue('green');
  await child.setViewportSize({ width: 480, height: 360 });
  await expect
    .poll(
      async () => (await child.locator('.canvas-frame').boundingBox())?.height,
    )
    .toBeLessThanOrEqual(360);
  await expect(child.locator('.topbar')).toBeHidden();
  await expect(page.locator('.lm_tab')).toHaveCount(0);
  await expect(page.locator('#layoutSummary')).toContainText('0 components');
  await expect(page.locator('#layoutSummary')).toContainText('1 pop-outs');
  await page.selectOption('#apiActionSelect', 'popin');
  await page.locator('#apiRunButton').click();
  await expect(page.locator('.lm_tab')).toHaveCount(2);
  await expect(page.locator('.lm_tab[title="Overview"]')).toBeVisible();
  await expect(page.locator('.lm_tab[title="Details"]')).toBeVisible();
  await page.locator('.lm_tab[title="Overview"]').click();
  await expect(
    page.locator('#layoutContainer input:visible').first(),
  ).toHaveValue('teal');
  await page.locator('.lm_tab[title="Details"]').click();
  await expect(
    page.locator('#layoutContainer input:visible').first(),
  ).toHaveValue('green');
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
});

import { expect, test } from '@playwright/test';

test('within-stack drag keeps visible, runtime, and saved tab order aligned', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.goto('/');
  await page.selectOption('#layoutSelect', 'miniStack');
  await page.locator('#loadLayoutButton').click();
  await expect(page.locator('.lm_stack .lm_tab')).toHaveCount(2);

  const snapshot = () =>
    page.evaluate(() => {
      const layout = window.strelitApiTestApp._strelitLayout;
      const stack = layout.rootItem as {
        contentItems: Array<{ title: string }>;
        getActiveComponentItem(): { title: string } | undefined;
      };
      const saved = layout.saveLayout().root as {
        content: Array<{ title: string }>;
        activeItemIndex: number;
      };
      return {
        visible: Array.from(
          document.querySelectorAll('.lm_stack .lm_tabs .lm_tab'),
        ).map((tab) => tab.getAttribute('title')),
        runtime: stack.contentItems.map((item) => item.title),
        saved: saved.content.map((item) => item.title),
        active: stack.getActiveComponentItem()?.title,
        savedActive: saved.content[saved.activeItemIndex]?.title,
      };
    });

  expect(await snapshot()).toEqual({
    visible: ['Overview', 'Details'],
    runtime: ['Overview', 'Details'],
    saved: ['Overview', 'Details'],
    active: 'Overview',
    savedActive: 'Overview',
  });

  const target = page.locator('.lm_stack .lm_tab[title="Details"]');
  const targetBox = await target.boundingBox();
  if (targetBox === null)
    throw new Error('Expected the target tab to be visible');
  await page.locator('.lm_stack .lm_tab[title="Overview"]').dragTo(target, {
    targetPosition: { x: targetBox.width - 2, y: targetBox.height / 2 },
    steps: 20,
  });

  expect(await snapshot()).toEqual({
    visible: ['Details', 'Overview'],
    runtime: ['Details', 'Overview'],
    saved: ['Details', 'Overview'],
    active: 'Overview',
    savedActive: 'Overview',
  });
  await page.locator('#saveLayoutButton').click();
  await page.locator('#reloadSavedLayoutButton').click();
  expect(await snapshot()).toEqual({
    visible: ['Details', 'Overview'],
    runtime: ['Details', 'Overview'],
    saved: ['Details', 'Overview'],
    active: 'Overview',
    savedActive: 'Overview',
  });
  expect(runtimeErrors).toEqual([]);
});

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

test('header position selector updates every canvas stack and saved layout', async ({
  page,
}) => {
  await page.goto('/');
  const selector = page.locator('#headerPositionSelect');
  const stacks = page.locator('#layoutContainer .lm_stack');
  await expect(selector).toHaveValue('top');
  await expect(stacks).toHaveCount(5);
  await expect(stacks.locator('.lm_header')).toHaveCount(5);
  await expect(page.locator('#layoutContainer .lm_bottom')).toHaveCount(0);
  await expect(page.locator('#layoutContainer .lm_left')).toHaveCount(0);
  await expect(page.locator('#layoutContainer .lm_right')).toHaveCount(0);

  for (const [position, className] of [
    ['bottom', 'lm_bottom'],
    ['left', 'lm_left'],
    ['right', 'lm_right'],
  ] as const) {
    await selector.selectOption(position);
    await expect(
      page.locator(`#layoutContainer .lm_stack.${className}`),
    ).toHaveCount(5);
    await expect(selector).toHaveValue(position);
  }

  await page.locator('#saveLayoutButton').click();
  await page.locator('#reloadSavedLayoutButton').click();
  await expect(page.locator('#layoutContainer .lm_stack.lm_right')).toHaveCount(
    5,
  );
  await expect(selector).toHaveValue('right');

  const rightStack = page.locator('#layoutContainer .lm_stack').filter({
    has: page.locator('.lm_tab[title="Fnts 100"]'),
  });
  const [child] = await Promise.all([
    page.waitForEvent('popup'),
    rightStack.locator('.lm_popout').click(),
  ]);
  await expect(child.locator('.lm_stack.lm_right')).toHaveCount(1);
  await child.close({ runBeforeUnload: false });
  await expect(page.locator('#layoutContainer .lm_stack.lm_right')).toHaveCount(
    5,
  );

  await selector.selectOption('top');
  await expect(page.locator('#layoutContainer .lm_stack.lm_right')).toHaveCount(
    0,
  );
  await expect(selector).toHaveValue('top');
  await expect(page.locator('#liveSnapshot')).toContainText('"show": "top"');

  await page.selectOption('#layoutSelect', 'standard');
  await page.locator('#configFromPresetButton').click();
  const customConfig = JSON.parse(
    await page.locator('#configEditor').inputValue(),
  );
  customConfig.root.content[0].content[0].header.show = 'bottom';
  await page.locator('#configEditor').fill(JSON.stringify(customConfig));
  await page.locator('#applyConfigButton').click();
  await expect(selector).toHaveValue('mixed');
  await selector.selectOption('top');
  await expect(selector).toHaveValue('top');
  await expect(page.locator('#layoutContainer .lm_bottom')).toHaveCount(0);

  await page.locator('#clearButton').click();
  await expect(selector).toBeDisabled();
  await page.locator('#loadLayoutButton').click();
  await expect(selector).toBeEnabled();
  await expect(selector).toHaveValue('top');
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
  await expect(page.locator('#layoutContainer .lm_popout')).toHaveCount(1);
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
  await expect(child.locator('.lm_popout')).toHaveCount(0);
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

test('closing a pop-out window returns its stack when popInOnClose is enabled', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.lm_tab[title="Fnts 100"]')).toBeVisible();
  const layoutStructure = () =>
    page.evaluate(() => {
      interface Item {
        type: string;
        title?: string;
        contentItems: Item[];
      }
      const describe = (item: Item): unknown => ({
        type: item.type,
        title: item.title,
        content: item.contentItems.map(describe),
      });
      return describe(window.strelitApiTestApp.layout.rootItem as Item);
    });
  const originalStructure = await layoutStructure();
  const [child] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#layoutContainer .lm_popout').first().click(),
  ]);
  await expect(child.locator('.lm_tab[title="Fnts 100"]')).toBeVisible();
  await expect(child.locator('.lm_popout')).toHaveCount(0);
  await expect(child.locator('.lm_stack .lm_close')).toHaveCount(0);
  await expect(child.locator('.lm_close_tab')).toHaveCount(1);
  await expect(child.locator('.lm_popin')).toHaveCount(0);
  await expect(page.locator('.lm_tab[title="Fnts 100"]')).toHaveCount(0);

  await child.evaluate(() => window.close());
  await expect.poll(() => child.isClosed()).toBe(true);
  await expect(page.locator('.lm_tab[title="Fnts 100"]')).toBeVisible();
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
  expect(await layoutStructure()).toEqual(originalStructure);
  await expect(
    page.locator('#layoutContainer .lm_popout').first(),
  ).toBeVisible();
});

test('the child pop-in button returns a stack when popInOnClose is disabled', async ({
  page,
}) => {
  await page.goto('/');
  await page.selectOption('#layoutSelect', 'miniStack');
  await page.locator('#configFromPresetButton').click();
  const config = JSON.parse(await page.locator('#configEditor').inputValue());
  config.settings = { popoutWholeStack: true, popInOnClose: false };
  await page.locator('#configEditor').fill(JSON.stringify(config));
  await page.locator('#applyConfigButton').click();
  await expect(page.locator('.lm_tab')).toHaveCount(2);

  const [child] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#layoutContainer .lm_popout').click(),
  ]);
  await expect(child.locator('.lm_tab')).toHaveCount(2);
  await expect(child.locator('.lm_popout')).toHaveCount(0);
  await expect(child.locator('.lm_popin')).toBeVisible();
  await expect(page.locator('.lm_tab')).toHaveCount(0);

  await child.locator('.lm_popin').click();
  await expect(page.locator('.lm_tab')).toHaveCount(2);
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
  await expect.poll(() => child.isClosed()).toBe(true);
});

test('closing the right-hand pop-out restores its original row position', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    document.body.dataset.popoutParentDocument = 'original';
  });
  const layoutStructure = () =>
    page.evaluate(() => {
      interface Item {
        type: string;
        title?: string;
        contentItems: Item[];
      }
      const describe = (item: Item): unknown => ({
        type: item.type,
        title: item.title,
        content: item.contentItems.map(describe),
      });
      return describe(window.strelitApiTestApp.layout.rootItem as Item);
    });
  const originalStructure = await layoutStructure();
  const rightStack = page
    .locator('#layoutContainer .lm_stack')
    .filter({ has: page.locator('.lm_tab[title="comp 2"]') });
  const originalShare = await page.evaluate(
    () => window.strelitApiTestApp.layout.rootItem?.contentItems[1]?.size,
  );
  const originalBounds = await rightStack.boundingBox();
  if (originalBounds === null) {
    throw new Error('Expected the right-hand stack to be visible');
  }
  const [child] = await Promise.all([
    page.waitForEvent('popup'),
    rightStack.locator('.lm_popout').click(),
  ]);
  await expect(child.locator('.lm_tab[title="comp 2"]')).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        window.strelitApiTestApp.layout.saveLayout().openPopouts[0]?.root?.size,
    ),
  ).toBeCloseTo(originalShare!, 5);
  await child.close({ runBeforeUnload: false });
  await expect.poll(() => child.isClosed()).toBe(true);
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
  await expect(page.locator('body')).toHaveAttribute(
    'data-popout-parent-document',
    'original',
  );
  expect(await layoutStructure()).toEqual(originalStructure);
  const restoredBounds = await rightStack.boundingBox();
  expect(restoredBounds).not.toBeNull();
  expect(Math.abs(restoredBounds!.x - originalBounds.x)).toBeLessThan(5);
  expect(Math.abs(restoredBounds!.width - originalBounds.width)).toBeLessThan(
    5,
  );
  expect(
    await page.evaluate(
      () => window.strelitApiTestApp.layout.rootItem?.popInParentIds,
    ),
  ).toEqual([]);
});

test('closing the last tab in a pop-out returns its pane', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    document.body.dataset.popoutParentDocument = 'original';
  });
  const originalStack = page
    .locator('#layoutContainer .lm_stack')
    .filter({ has: page.locator('.lm_tab[title="Fnts 100"]') });
  const originalBounds = await originalStack.boundingBox();
  if (originalBounds === null) {
    throw new Error('Expected the stack to be visible');
  }
  const [child] = await Promise.all([
    page.waitForEvent('popup'),
    originalStack.locator('.lm_popout').click(),
  ]);
  await expect(child.locator('.lm_tab[title="Fnts 100"]')).toBeVisible();

  await child.locator('.lm_tab[title="Fnts 100"] .lm_close_tab').click();

  await expect.poll(() => child.isClosed(), { timeout: 3000 }).toBe(true);
  await expect(originalStack).toBeVisible();
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
  await expect(page.locator('body')).toHaveAttribute(
    'data-popout-parent-document',
    'original',
  );
  const restoredBounds = await originalStack.boundingBox();
  expect(restoredBounds).not.toBeNull();
  expect(Math.abs(restoredBounds!.x - originalBounds.x)).toBeLessThan(5);
  expect(Math.abs(restoredBounds!.width - originalBounds.width)).toBeLessThan(
    5,
  );
});

test('the child omits stack close while its pop-in button returns the whole stack', async ({
  page,
}) => {
  await page.goto('/');
  await page.selectOption('#layoutSelect', 'miniStack');
  await page.locator('#configFromPresetButton').click();
  const config = JSON.parse(await page.locator('#configEditor').inputValue());
  config.settings = { popoutWholeStack: true, popInOnClose: false };
  await page.locator('#configEditor').fill(JSON.stringify(config));
  await page.locator('#applyConfigButton').click();
  await page.evaluate(() => {
    document.body.dataset.popoutParentDocument = 'original';
  });

  const [child] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#layoutContainer .lm_popout').click(),
  ]);
  await expect(child.locator('.lm_tab')).toHaveCount(2);
  await expect(child.locator('.lm_stack .lm_close')).toHaveCount(0);
  await expect(child.locator('.lm_close_tab')).toHaveCount(2);
  await expect(child.locator('.lm_popin')).toBeVisible();
  await child.locator('.lm_popin').click();

  await expect.poll(() => child.isClosed(), { timeout: 3000 }).toBe(true);
  await expect(page.locator('.lm_tab[title="Overview"]')).toBeVisible();
  await expect(page.locator('.lm_tab[title="Details"]')).toBeVisible();
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
  await expect(page.locator('body')).toHaveAttribute(
    'data-popout-parent-document',
    'original',
  );
});

test('pop-out maximise demo expands one child stack and restores its split', async ({
  page,
}) => {
  await page.goto('/');
  await page.selectOption('#layoutSelect', 'popoutMaximiseDemo');
  const [child] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#loadLayoutButton').click(),
  ]);
  await expect(
    page.locator('#layoutContainer .lm_stack .lm_close'),
  ).toHaveCount(1);
  await expect(child.locator('.lm_stack')).toHaveCount(2);
  await expect(child.locator('.lm_tab[title="Editor"]')).toBeVisible();
  await expect(child.locator('.lm_tab[title="Preview"]')).toBeVisible();
  await expect
    .poll(
      async () =>
        (await child.locator('.lm_stack').first().boundingBox())?.height,
    )
    .toBeGreaterThan(100);
  await expect(child.locator('.lm_stack .lm_close')).toHaveCount(0);
  await expect(child.locator('.lm_close_tab')).toHaveCount(2);
  const editor = child.locator('.lm_stack').filter({
    has: child.locator('.lm_tab[title="Editor"]'),
  });
  const originalWidth = (await editor.boundingBox())?.width;
  if (originalWidth === undefined) {
    throw new Error('Expected a visible editor stack');
  }

  await editor.locator('.lm_maximise').click();
  await expect(editor).toHaveClass(/lm_maximised/);
  await expect
    .poll(async () => (await editor.boundingBox())?.width)
    .toBeGreaterThan(originalWidth * 1.5);
  await editor.locator('.lm_maximise').click();
  await expect(editor).not.toHaveClass(/lm_maximised/);
  await expect
    .poll(async () => (await editor.boundingBox())?.width)
    .toBeLessThan(originalWidth * 1.2);

  await child.close({ runBeforeUnload: false });
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
  await expect(page.locator('.lm_tab[title="Editor"]')).toBeVisible();
  await expect(page.locator('.lm_tab[title="Preview"]')).toBeVisible();
});

test('a narrow pop-out keeps its tab overflow menu and tab close buttons', async ({
  page,
}) => {
  await page.goto('/');
  const stack = page.locator('#layoutContainer .lm_stack').filter({
    has: page.locator('.lm_tab[title="comp 2"]'),
  });
  const [child] = await Promise.all([
    page.waitForEvent('popup'),
    stack.locator('.lm_popout').click(),
  ]);
  await expect(child.locator('.lm_tab')).toHaveCount(4);
  await child.setViewportSize({ width: 280, height: 600 });
  await expect(child.locator('.lm_stack .lm_close')).toHaveCount(0);
  await expect(child.locator('.lm_close_tab')).toHaveCount(4);
  await expect(child.locator('.lm_tabdropdown')).toBeVisible();
  await child.locator('.lm_tabdropdown').click();
  await expect(child.locator('.lm_tabdropdown_list')).toBeVisible();
  await expect(child.locator('.lm_tabdropdown_list')).toContainText(
    /comp [123]/,
  );
  await child.close({ runBeforeUnload: false });
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
});

test('closing one of two pop-out tabs removes only that tab, then the last X returns the rest', async ({
  page,
}) => {
  await page.goto('/');
  await page.selectOption('#layoutSelect', 'miniStack');
  await page.locator('#configFromPresetButton').click();
  const config = JSON.parse(await page.locator('#configEditor').inputValue());
  config.settings = { popoutWholeStack: true, popInOnClose: false };
  await page.locator('#configEditor').fill(JSON.stringify(config));
  await page.locator('#applyConfigButton').click();
  const [child] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#layoutContainer .lm_popout').click(),
  ]);
  await expect(child.locator('.lm_tab')).toHaveCount(2);

  await child.locator('.lm_tab[title="Overview"] .lm_close_tab').click();
  await expect(child.locator('.lm_tab[title="Overview"]')).toHaveCount(0);
  await expect(child.locator('.lm_tab[title="Details"]')).toBeVisible();
  expect(child.isClosed()).toBe(false);
  await expect(page.locator('#layoutSummary')).toContainText('1 pop-outs');

  await child.locator('.lm_tab[title="Details"] .lm_close_tab').click();
  await expect.poll(() => child.isClosed()).toBe(true);
  await expect(page.locator('.lm_tab[title="Overview"]')).toHaveCount(0);
  await expect(page.locator('.lm_tab[title="Details"]')).toBeVisible();
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
});

test('closing without pop-in releases the vacant return row', async ({
  page,
}) => {
  await page.goto('/');
  await page.selectOption('#layoutSelect', 'standard');
  await page.locator('#configFromPresetButton').click();
  const config = JSON.parse(await page.locator('#configEditor').inputValue());
  config.settings.popInOnClose = false;
  await page.locator('#configEditor').fill(JSON.stringify(config));
  await page.locator('#applyConfigButton').click();

  const rightStack = page
    .locator('#layoutContainer .lm_stack')
    .filter({ has: page.locator('.lm_tab[title="comp 2"]') });
  const [child] = await Promise.all([
    page.waitForEvent('popup'),
    rightStack.locator('.lm_popout').click(),
  ]);
  await expect(child.locator('.lm_tab[title="comp 2"]')).toHaveCount(1);
  await expect(page.locator('#layoutSummary')).toContainText('1 pop-outs');
  await child.close({ runBeforeUnload: false });
  await expect.poll(() => child.isClosed()).toBe(true);
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
  expect(
    await page.evaluate(() => ({
      type: window.strelitApiTestApp.layout.rootItem?.type,
      parentIds: window.strelitApiTestApp.layout.rootItem?.popInParentIds,
    })),
  ).toEqual({ type: 'column', parentIds: [] });
  await expect(page.locator('.lm_tab[title="comp 2"]')).toHaveCount(0);
});

for (const scenario of [
  {
    name: 'three panes in opening order',
    sizes: [30, 30, 40],
    close: ['A', 'B'],
  },
  {
    name: 'three panes in reverse order',
    sizes: [30, 30, 40],
    close: ['B', 'A'],
  },
  { name: 'both panes from one row', sizes: [50, 50], close: ['A', 'B'] },
]) {
  test(`concurrent pop-outs restore ${scenario.name}`, async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#layoutSelect', 'standard');
    await page.locator('#configFromPresetButton').click();
    const config = JSON.parse(await page.locator('#configEditor').inputValue());
    config.root = {
      type: 'row',
      content: scenario.sizes.map((size, index) => ({
        type: 'component',
        title: String.fromCharCode(65 + index),
        componentType: 'color',
        size: `${size}%`,
      })),
    };
    await page.locator('#configEditor').fill(JSON.stringify(config));
    await page.locator('#applyConfigButton').click();

    const names = scenario.sizes.map((_, index) =>
      String.fromCharCode(65 + index),
    );
    const stack = (name: string) =>
      page.locator('#layoutContainer .lm_stack').filter({
        has: page.locator(`.lm_tab[title="${name}"]`),
      });
    const originalBounds = await Promise.all(
      names.map((name) => stack(name).boundingBox()),
    );
    expect(originalBounds.every((bounds) => bounds !== null)).toBe(true);
    const children = new Map<string, import('@playwright/test').Page>();
    for (const name of ['A', 'B']) {
      const [child] = await Promise.all([
        page.waitForEvent('popup'),
        stack(name).locator('.lm_popout').click(),
      ]);
      await expect(child.locator(`.lm_tab[title="${name}"]`)).toBeVisible();
      children.set(name, child);
    }
    await expect(page.locator('#layoutSummary')).toContainText('2 pop-outs');

    for (const name of scenario.close) {
      const child = children.get(name)!;
      await child.evaluate(() => window.close());
      await expect.poll(() => child.isClosed()).toBe(true);
    }
    await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
    expect(
      await page.evaluate(() => ({
        type: window.strelitApiTestApp.layout.rootItem?.type,
        titles: window.strelitApiTestApp.layout.rootItem?.contentItems.map(
          (item) => item.contentItems[0]?.title,
        ),
        parentIds: window.strelitApiTestApp.layout.rootItem?.popInParentIds,
      })),
    ).toEqual({ type: 'row', titles: names, parentIds: [] });
    for (const [index, name] of names.entries()) {
      const restoredBounds = await stack(name).boundingBox();
      expect(restoredBounds).not.toBeNull();
      expect(
        Math.abs(restoredBounds!.x - originalBounds[index]!.x),
      ).toBeLessThan(5);
      expect(
        Math.abs(restoredBounds!.width - originalBounds[index]!.width),
      ).toBeLessThan(5);
    }
  });
}

test('closing two pop-outs without pop-in removes their empty return row', async ({
  page,
}) => {
  await page.goto('/');
  await page.selectOption('#layoutSelect', 'standard');
  await page.locator('#configFromPresetButton').click();
  const config = JSON.parse(await page.locator('#configEditor').inputValue());
  config.settings.popInOnClose = false;
  config.root = {
    type: 'row',
    content: ['A', 'B'].map((title) => ({
      type: 'component',
      title,
      componentType: 'color',
      size: '50%',
    })),
  };
  await page.locator('#configEditor').fill(JSON.stringify(config));
  await page.locator('#applyConfigButton').click();

  const children: import('@playwright/test').Page[] = [];
  for (const name of ['A', 'B']) {
    const [child] = await Promise.all([
      page.waitForEvent('popup'),
      page
        .locator('#layoutContainer .lm_stack')
        .filter({ has: page.locator(`.lm_tab[title="${name}"]`) })
        .locator('.lm_popout')
        .click(),
    ]);
    await expect(child.locator(`.lm_tab[title="${name}"]`)).toBeVisible();
    children.push(child);
  }
  for (const child of children) {
    await child.evaluate(() => window.close());
    await expect.poll(() => child.isClosed()).toBe(true);
  }
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
  await expect(page.locator('#layoutContainer .lm_tab')).toHaveCount(0);
  expect(
    await page.evaluate(() => window.strelitApiTestApp.layout.rootItem),
  ).toBeUndefined();
});

test('discarding one pop-out keeps the next return in its original order', async ({
  page,
}) => {
  await page.goto('/');
  await page.selectOption('#layoutSelect', 'standard');
  await page.locator('#configFromPresetButton').click();
  const config = JSON.parse(await page.locator('#configEditor').inputValue());
  config.settings.popInOnClose = false;
  config.root = {
    type: 'row',
    content: ['A', 'B', 'C'].map((title, index) => ({
      type: 'component',
      title,
      componentType: 'color',
      size: `${index === 2 ? 40 : 30}%`,
    })),
  };
  await page.locator('#configEditor').fill(JSON.stringify(config));
  await page.locator('#applyConfigButton').click();

  const children = new Map<string, import('@playwright/test').Page>();
  for (const name of ['A', 'B']) {
    const [child] = await Promise.all([
      page.waitForEvent('popup'),
      page
        .locator('#layoutContainer .lm_stack')
        .filter({ has: page.locator(`.lm_tab[title="${name}"]`) })
        .locator('.lm_popout')
        .click(),
    ]);
    children.set(name, child);
    await expect(child.locator(`.lm_tab[title="${name}"]`)).toHaveCount(1);
    await expect(
      page.locator(`#layoutContainer .lm_tab[title="${name}"]`),
    ).toHaveCount(0);
  }
  await children.get('A')!.evaluate(() => window.close());
  await expect.poll(() => children.get('A')!.isClosed()).toBe(true);
  await children.get('B')!.locator('.lm_popin').click();
  await expect.poll(() => children.get('B')!.isClosed()).toBe(true);
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
  const restored = await page.evaluate(() => ({
    titles: window.strelitApiTestApp.layout.rootItem?.contentItems.map(
      (item) => item.contentItems[0]?.title,
    ),
    sizes: window.strelitApiTestApp.layout.rootItem?.contentItems.map(
      (item) => item.size,
    ),
  }));
  expect(restored.titles).toEqual(['B', 'C']);
  expect(restored.sizes?.[0]).toBeCloseTo(300 / 7, 1);
  expect(restored.sizes?.[1]).toBeCloseTo(400 / 7, 1);
});

test('reloading a saved layout replaces its open pop-out without losing the return marker', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.goto('/');
  const rightStack = page
    .locator('#layoutContainer .lm_stack')
    .filter({ has: page.locator('.lm_tab[title="comp 2"]') });
  const [originalChild] = await Promise.all([
    page.waitForEvent('popup'),
    rightStack.locator('.lm_popout').click(),
  ]);
  await expect(originalChild.locator('.lm_tab[title="comp 2"]')).toHaveCount(1);
  await page.locator('#saveLayoutButton').click();
  const [replacementChild] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#reloadSavedLayoutButton').click(),
  ]);
  await expect(replacementChild.locator('.lm_tab[title="comp 2"]')).toHaveCount(
    1,
  );
  await expect.poll(() => originalChild.isClosed()).toBe(true);
  await expect(page.locator('#layoutSummary')).toContainText('1 pop-outs');
  expect(runtimeErrors).toEqual([]);
  await replacementChild.evaluate(() => window.close());
  await expect.poll(() => replacementChild.isClosed()).toBe(true);
  await expect(page.locator('.lm_tab[title="comp 2"]')).toHaveCount(1);
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
});

test('a discarded pane stays excluded after saving and reloading another pop-out', async ({
  page,
}) => {
  await page.goto('/');
  await page.selectOption('#layoutSelect', 'standard');
  await page.locator('#configFromPresetButton').click();
  const config = JSON.parse(await page.locator('#configEditor').inputValue());
  config.settings.popInOnClose = false;
  config.root = {
    type: 'row',
    content: ['A', 'B', 'C'].map((title, index) => ({
      type: 'component',
      title,
      componentType: 'color',
      size: `${index === 2 ? 40 : 30}%`,
    })),
  };
  await page.locator('#configEditor').fill(JSON.stringify(config));
  await page.locator('#applyConfigButton').click();

  const children = new Map<string, import('@playwright/test').Page>();
  for (const name of ['A', 'B']) {
    const [child] = await Promise.all([
      page.waitForEvent('popup'),
      page
        .locator('#layoutContainer .lm_stack')
        .filter({ has: page.locator(`.lm_tab[title="${name}"]`) })
        .locator('.lm_popout')
        .click(),
    ]);
    children.set(name, child);
    await expect(child.locator(`.lm_tab[title="${name}"]`)).toHaveCount(1);
    await expect(
      page.locator(`#layoutContainer .lm_tab[title="${name}"]`),
    ).toHaveCount(0);
  }
  await children.get('A')!.evaluate(() => window.close());
  await expect.poll(() => children.get('A')!.isClosed()).toBe(true);
  await expect(page.locator('#layoutSummary')).toContainText('1 pop-outs');
  const savedPopout = await page.evaluate(
    () => window.strelitApiTestApp.layout.saveLayout().openPopouts[0],
  );
  expect(savedPopout?.indexInParent).toBe(0);
  expect(savedPopout?.root?.size).toBeCloseTo(300 / 7, 1);
  await page.locator('#saveLayoutButton').click();
  const [replacement] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#reloadSavedLayoutButton').click(),
  ]);
  await expect(replacement.locator('.lm_tab[title="B"]')).toHaveCount(1);
  await replacement.locator('.lm_popin').click();
  await expect.poll(() => replacement.isClosed()).toBe(true);
  await expect(page.locator('#layoutSummary')).toContainText('0 pop-outs');
  const restored = await page.evaluate(() => ({
    titles: window.strelitApiTestApp.layout.rootItem?.contentItems.map(
      (item) => item.contentItems[0]?.title,
    ),
    sizes: window.strelitApiTestApp.layout.rootItem?.contentItems.map(
      (item) => item.size,
    ),
  }));
  expect(restored.titles).toEqual(['B', 'C']);
  expect(restored.sizes?.[0]).toBeCloseTo(300 / 7, 1);
  expect(restored.sizes?.[1]).toBeCloseTo(400 / 7, 1);
});

test('root component rejects stack references and virtual inputs stay inside their pane', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#loadComponentAsRootButton').click();
  await expect(page.locator('.lm_tab')).toHaveCount(0);
  await expect(page.locator('#apiTargetSelect')).toHaveValue('0');
  await page.locator('.api-explorer summary').click();
  await page.selectOption('#apiMethodSelect', 'focusComponent');
  await page.locator('#apiArgsEditor').fill('[{"$ref":"stack"}]');
  await page.locator('#runMethodButton').click();
  await expect(page.locator('#workbenchStatus')).toHaveClass(/error/);
  await expect(page.locator('#methodResult')).toContainText(
    'No stack object is available',
  );

  const input = page.locator(
    '#layoutContainer > .strelit-demo-component input',
  );
  await expect(input).toBeVisible();
  const geometry = await input.evaluate((element) => {
    const inputRect = element.getBoundingClientRect();
    const paneRect = element.parentElement!.getBoundingClientRect();
    return {
      inputRight: inputRect.right,
      paneRight: paneRect.right,
      boxSizing: getComputedStyle(element).boxSizing,
      paddingLeft: getComputedStyle(element).paddingLeft,
    };
  });
  expect(geometry.inputRight).toBeLessThanOrEqual(geometry.paneRight);
  expect(geometry.boxSizing).toBe('border-box');
  expect(geometry.paddingLeft).toBe('9px');
});

test('workbench keeps the selected component after an earlier tab closes', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#apiTargetSelect option').first()).toContainText(
    'Fnts 100',
  );
  await page.selectOption('#apiTargetSelect', '1');
  const selectedLabel = await page
    .locator('#apiTargetSelect option:checked')
    .textContent();
  const selectedTitle = selectedLabel!.replace(/^\d+\. /u, '');
  await page.locator('.lm_tab[title="Fnts 100"] .lm_close_tab').click();
  await expect(page.locator('#layoutSummary')).toContainText('9 components');
  await expect(page.locator('#apiTargetSelect option:checked')).toContainText(
    selectedTitle,
  );
  await expect(page.locator('#apiTargetSelect')).toHaveValue('0');

  await page.selectOption('#apiActionSelect', 'rename');
  await page.locator('#apiActionValue').fill('Selected stays selected');
  await page.locator('#apiRunButton').click();
  await expect(
    page.locator('.lm_tab[title="Selected stays selected"]'),
  ).toBeVisible();
  await expect(page.locator('#apiTargetSelect option:checked')).toContainText(
    'Selected stays selected',
  );

  await page.selectOption('#apiActionSelect', 'close');
  await page.locator('#apiRunButton').click();
  await expect(page.locator('#apiTargetSelect')).toHaveValue('');
  await page.locator('#apiRunButton').click();
  await expect(page.locator('#workbenchStatus')).toContainText(
    'Select a component first',
  );
});

test('miniStack keeps white component text legible', async ({ page }) => {
  await page.goto('/');
  await page.selectOption('#layoutSelect', 'miniStack');
  await page.locator('#loadLayoutButton').click();
  const label = page.locator('.strelit-demo-color-label').first();
  await expect(label).toBeVisible();
  const colors = await label.evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor,
  }));
  expect(colors.foreground).toBe('rgb(255, 255, 255)');
  expect(colors.background).not.toBe('rgb(255, 255, 255)');
  expect(colors.background).not.toBe('rgba(0, 0, 0, 0)');
});

test('dragging the only tab between stacks leaves a saveable layout', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.goto('/');
  await page.selectOption('#layoutSelect', 'miniRow');
  await page.locator('#loadLayoutButton').click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  await page.locator('.lm_tab[title="Details"]').evaluate((tab) => {
    const app = window.strelitApiTestApp as unknown as {
      _strelitLayout: {
        on(eventName: 'stateChanged', callback: () => void): void;
        saveLayout(): unknown;
      };
    };
    const state = window as unknown as {
      phase2SavedLayouts: string[];
      phase2StateChanges: number;
    };
    state.phase2SavedLayouts = [];
    state.phase2StateChanges = 0;
    app._strelitLayout.on('stateChanged', () => {
      state.phase2StateChanges++;
      state.phase2SavedLayouts.push(
        JSON.stringify(app._strelitLayout.saveLayout()),
      );
    });
    const rect = tab.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    tab.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        isPrimary: true,
        pointerId: 71,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 71,
        pointerType: 'touch',
        clientX: x + 40,
        clientY: y + 40,
      }),
    );
    if (document.querySelector('.lm_dragProxy') === null) {
      throw new Error('The cancelled pointer gesture did not start a drag');
    }
  });
  await expect(page.locator('.lm_dragProxy')).toHaveCount(1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { phase2StateChanges: number })
          .phase2StateChanges,
    ),
  ).toBe(0);
  await page.evaluate(() => {
    document.dispatchEvent(
      new PointerEvent('pointercancel', {
        bubbles: true,
        pointerId: 71,
        pointerType: 'touch',
      }),
    );
  });
  await expect(page.locator('.lm_dragProxy')).toHaveCount(0);
  await expect(page.locator('.lm_stack')).toHaveCount(2);
  await expect(page.locator('.lm_tab')).toHaveCount(2);
  const originalStackTitles = await page
    .locator('.lm_stack')
    .evaluateAll((stacks) =>
      stacks.map((stack) =>
        Array.from(stack.querySelectorAll('.lm_tab')).map((tab) =>
          tab.getAttribute('title'),
        ),
      ),
    );
  expect(originalStackTitles).toEqual([['Overview'], ['Details']]);
  await page.locator('#saveLayoutButton').click();
  await expect(page.locator('#reloadSavedLayoutButton')).toBeEnabled();
  await page.locator('#reloadSavedLayoutButton').click();
  await expect(page.locator('.lm_stack')).toHaveCount(2);
  const restoredStackTitles = await page
    .locator('.lm_stack')
    .evaluateAll((stacks) =>
      stacks.map((stack) =>
        Array.from(stack.querySelectorAll('.lm_tab')).map((tab) =>
          tab.getAttribute('title'),
        ),
      ),
    );
  expect(restoredStackTitles).toEqual([['Overview'], ['Details']]);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  await page.evaluate(() => {
    const state = window as unknown as {
      phase2SavedLayouts: string[];
      phase2StateChanges: number;
    };
    state.phase2SavedLayouts = [];
    state.phase2StateChanges = 0;
  });

  const source = page.locator('.lm_tab[title="Details"]');
  const target = page.locator('.lm_tab[title="Overview"]');
  const targetBox = await target.boundingBox();
  if (targetBox === null) {
    throw new Error('Expected the target tab to be visible');
  }
  await source.dragTo(target, {
    targetPosition: { x: targetBox.width - 2, y: targetBox.height / 2 },
    steps: 20,
  });

  await expect(page.locator('.lm_dragProxy')).toHaveCount(0);
  await expect(page.locator('.lm_tab')).toHaveCount(2);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const autosavedLayouts = await page.evaluate(
    () =>
      (window as unknown as { phase2SavedLayouts: string[] })
        .phase2SavedLayouts,
  );
  expect(autosavedLayouts.length).toBeGreaterThan(0);
  const latestAutosave = autosavedLayouts.at(-1);
  if (latestAutosave === undefined) {
    throw new Error('Expected a successful-drop autosave');
  }
  const autosavedLayout = JSON.parse(latestAutosave) as {
    root?: { type?: string };
  };
  expect(autosavedLayout.root?.type).toBe('stack');
  const autosavedTitles = latestAutosave.match(
    /"title":"(?:Overview|Details)"/g,
  );
  expect(autosavedTitles?.sort()).toEqual([
    '"title":"Details"',
    '"title":"Overview"',
  ]);
  const saved = await page.evaluate(() => {
    const app = window.strelitApiTestApp as unknown as {
      _strelitLayout: {
        saveLayout(): unknown;
      };
    };
    return app._strelitLayout.saveLayout();
  });
  const titles = JSON.stringify(saved).match(/"title":"(?:Overview|Details)"/g);
  expect(titles?.sort()).toEqual(['"title":"Details"', '"title":"Overview"']);
  expect((saved as { root?: { type: string } }).root?.type).toBe('stack');
  await page.locator('#saveLayoutButton').click();
  await page.locator('#reloadSavedLayoutButton').click();
  await expect(page.locator('.lm_tab')).toHaveCount(2);
  expect(runtimeErrors).toEqual([]);
});

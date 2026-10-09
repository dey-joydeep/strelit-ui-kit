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

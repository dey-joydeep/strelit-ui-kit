import { afterEach, describe, expect, it, vi } from 'vitest';
import { minifyResolvedLayoutConfig, resolveLayoutConfig } from '../../src';

describe('virtual layout popout bootstrap', () => {
  const originalUrl = document.location.href;

  afterEach(() => {
    history.replaceState({}, '', originalUrl);
    localStorage.clear();
  });

  it('keeps the stored popout config available across a child reload', async () => {
    const storageKey = 'strelit-window-config-reload-test';
    const storedConfig = minifyResolvedLayoutConfig(
      resolveLayoutConfig({
        root: {
          type: 'component',
          componentType: 'testComponent',
        },
      }),
    );
    localStorage.setItem(storageKey, JSON.stringify(storedConfig));
    history.replaceState({}, '', `/?strelit-window=${storageKey}`);
    vi.resetModules();
    const { createVirtualLayoutManagerConstructorParameters } =
      await import('../../src/ts/virtual-layout');

    const parameters = createVirtualLayoutManagerConstructorParameters(
      document.createElement('div'),
    );

    expect(parameters.isSubWindow).toBe(true);
    expect(parameters.subWindowLayoutConfig?.root?.type).toBe('component');
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as publicApi from '../../src';
import { minifyResolvedLayoutConfig, resolveLayoutConfig } from '../../src';

describe('virtual layout popout bootstrap', () => {
  const originalUrl = document.location.href;

  afterEach(() => {
    history.replaceState({}, '', originalUrl);
    localStorage.clear();
  });

  it('does not expose internal virtual-layout construction helpers', () => {
    expect('createVirtualLayoutManagerConstructorParameters' in publicApi).toBe(
      false,
    );
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

  it('rejects over-depth stored popout data before recursively unminifying it', async () => {
    const storageKey = 'strelit-window-config-depth-test';
    const storedConfig: Record<string, unknown> = {};
    let cursor = storedConfig;
    for (let depth = 0; depth < 130; depth++) {
      const child: Record<string, unknown> = {};
      cursor.content = child;
      cursor = child;
    }
    localStorage.setItem(storageKey, JSON.stringify(storedConfig));
    history.replaceState({}, '', `/?strelit-window=${storageKey}`);
    vi.resetModules();
    const { createVirtualLayoutManagerConstructorParameters } =
      await import('../../src/ts/virtual-layout');

    expect(() =>
      createVirtualLayoutManagerConstructorParameters(
        document.createElement('div'),
      ),
    ).toThrow(/limit/i);
  });

  it.each([
    {
      name: 'missing',
      storedConfig: undefined,
      expectedError: /Missing Strelit popout configuration/,
    },
    {
      name: 'corrupt',
      storedConfig: '{',
      expectedError: /Corrupt Strelit popout configuration/,
    },
  ])(
    'preserves subwindow detection after $name configuration failure',
    async ({ storedConfig, expectedError }) => {
      const storageKey = 'strelit-window-config-retry-test';
      if (storedConfig !== undefined) {
        localStorage.setItem(storageKey, storedConfig);
      }
      history.replaceState({}, '', `/?strelit-window=${storageKey}`);
      vi.resetModules();
      const { createVirtualLayoutManagerConstructorParameters } =
        await import('../../src/ts/virtual-layout');

      for (let attempt = 0; attempt < 2; attempt++) {
        expect(() =>
          createVirtualLayoutManagerConstructorParameters(
            document.createElement('div'),
          ),
        ).toThrow(expectedError);
      }
    },
  );
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as publicApi from '../../src';
import { minifyResolvedLayoutConfig, resolveLayoutConfig } from '../../src';

describe('virtual layout popout bootstrap', () => {
  const originalUrl = document.location.href;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    history.replaceState({}, '', originalUrl);
    localStorage.clear();
    window.__strelitInstance = undefined;
  });

  it('removes a deferred DOM-ready listener when destroyed', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const layout = new publicApi.VirtualLayout(
      undefined,
      undefined,
      undefined,
      true,
    );

    layout.init();
    const listener = addEventListener.mock.calls.find(
      ([eventName]) => eventName === 'DOMContentLoaded',
    )?.[1];
    expect(listener).toBeTypeOf('function');

    layout.destroy();
    expect(removeEventListener).toHaveBeenCalledWith(
      'DOMContentLoaded',
      listener,
    );
  });

  it('removes a deferred subwindow load listener when destroyed', async () => {
    const storageKey = 'strelit-window-load-cleanup-test';
    localStorage.setItem(
      storageKey,
      JSON.stringify(minifyResolvedLayoutConfig(resolveLayoutConfig({}))),
    );
    history.replaceState({}, '', `/?strelit-window=${storageKey}`);
    vi.resetModules();
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('interactive');
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const { VirtualLayout } = await import('../../src/ts/virtual-layout');
    const layout = new VirtualLayout(undefined, undefined, undefined, true);

    layout.init();
    const listener = addEventListener.mock.calls.find(
      ([eventName]) => eventName === 'load',
    )?.[1];
    expect(listener).toBeTypeOf('function');

    layout.destroy();
    expect(removeEventListener).toHaveBeenCalledWith('load', listener);
  });

  it('cancels deferred subwindow creation when destroyed', async () => {
    const storageKey = 'strelit-window-timeout-cleanup-test';
    localStorage.setItem(
      storageKey,
      JSON.stringify(minifyResolvedLayoutConfig(resolveLayoutConfig({}))),
    );
    history.replaceState({}, '', `/?strelit-window=${storageKey}`);
    vi.resetModules();
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    vi.useFakeTimers();
    const setTimeout = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeout = vi.spyOn(globalThis, 'clearTimeout');
    const { VirtualLayout } = await import('../../src/ts/virtual-layout');
    const layout = new VirtualLayout(undefined, undefined, undefined, true);

    layout.init();
    const timeout = setTimeout.mock.results.at(-1)?.value;
    expect(timeout).toBeDefined();

    layout.destroy();
    expect(clearTimeout).toHaveBeenCalledWith(timeout);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears only its own window bridge reference on destroy', () => {
    const layout = new publicApi.VirtualLayout(
      undefined,
      undefined,
      undefined,
      true,
    );
    window.__strelitInstance = layout;
    layout.destroy();
    expect(window.__strelitInstance).toBeUndefined();

    const replacementOwner = new publicApi.VirtualLayout(
      undefined,
      undefined,
      undefined,
      true,
    );
    const replacement = {} as publicApi.LayoutManager;
    window.__strelitInstance = replacement;
    replacementOwner.destroy();
    expect(window.__strelitInstance).toBe(replacement);
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

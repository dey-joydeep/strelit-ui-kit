import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComponentContainer,
  StrelitLayout,
  LayoutConfig,
  ComponentItem,
  resolveLayoutConfig,
} from '../../src';

describe('BrowserPopout functionality (item.popout())', function () {
  let layout: StrelitLayout;

  beforeEach(function () {
    layout = new StrelitLayout();
    layout.registerComponentFactoryFunction(
      'testComponent',
      (container: ComponentContainer) => {
        const span = document.createElement('span');
        span.innerText = 'popout test';
        container.element.appendChild(span);
      },
    );
  });

  afterEach(function () {
    layout.destroy();
  });

  it('creates a BrowserPopout and tracks open popouts', function () {
    const mockWindow = {
      closed: false,
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      document: {
        createElement: () => document.createElement('div'),
        body: document.createElement('body'),
        head: document.createElement('head'),
        write: vi.fn(),
        close: vi.fn(),
      },
      location: { href: '' },
    } as unknown as Window;

    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWindow);

    const config: LayoutConfig = {
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            id: 'compA',
            componentType: 'testComponent',
          },
        ],
      },
    };

    layout.loadLayout(config);

    expect(layout.openPopouts.length).toBe(0);

    const compA = layout.findFirstComponentItemById('compA') as ComponentItem;
    expect(compA).toBeDefined();

    const popout = compA.popout();

    expect(openSpy).toHaveBeenCalled();
    expect(layout.openPopouts.length).toBe(1);
    expect(layout.openPopouts[0]).toBe(popout);

    openSpy.mockRestore();
  });

  it('saves a pending popout before its child layout initializes', function () {
    const mockWindow = {
      closed: false,
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      document: {
        createElement: () => document.createElement('div'),
        body: document.createElement('body'),
        head: document.createElement('head'),
        write: vi.fn(),
        close: vi.fn(),
      },
      location: { href: '' },
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(mockWindow);
    layout.loadLayout({
      root: {
        type: 'component',
        id: 'pending',
        componentType: 'testComponent',
      },
    });
    const item = layout.findFirstComponentItemById('pending') as ComponentItem;
    const popout = item.popout();

    expect(() => layout.saveLayout()).not.toThrow();
    expect(layout.saveLayout().openPopouts[0].root?.id).toBe('pending');
    expect(() => popout.getStrelitInstance()).toThrow(
      'UnexpectedUndefined: BPGGI24694',
    );
  });

  it('removes the source item only after the child layout initializes', function () {
    vi.useFakeTimers();
    try {
      const mockWindow = {
        closed: false,
        close: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        document: {
          createElement: () => document.createElement('div'),
          body: document.createElement('body'),
          head: document.createElement('head'),
          write: vi.fn(),
          close: vi.fn(),
        },
        location: { href: '' },
      } as unknown as Window;
      vi.spyOn(window, 'open').mockReturnValue(mockWindow);
      layout.loadLayout({
        root: {
          type: 'component',
          id: 'initialising-popout',
          componentType: 'testComponent',
        },
      });
      const item = layout.findFirstComponentItemById(
        'initialising-popout',
      ) as ComponentItem;

      item.popout();
      expect(layout.findFirstComponentItemById('initialising-popout')).toBe(
        item,
      );

      mockWindow.__strelitInstance = {
        closeWindow: vi.fn(),
        isInitialised: true,
        on: vi.fn(),
      } as never;
      vi.advanceTimersByTime(10);

      expect(
        layout.findFirstComponentItemById('initialising-popout'),
      ).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores a pending popout when its window closes before initialization', function () {
    let beforeUnload: (() => void) | undefined;
    const mockWindow = {
      closed: false,
      close: vi.fn(),
      addEventListener: vi.fn((name: string, listener: () => void) => {
        if (name === 'beforeunload') {
          beforeUnload = listener;
        }
      }),
      removeEventListener: vi.fn(),
      document: {
        createElement: () => document.createElement('div'),
        body: document.createElement('body'),
        head: document.createElement('head'),
        write: vi.fn(),
        close: vi.fn(),
      },
      location: { href: '' },
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(mockWindow);
    layout.loadLayout({
      settings: { popInOnClose: true },
      root: {
        type: 'component',
        id: 'pending-close',
        componentType: 'testComponent',
      },
    });
    const item = layout.findFirstComponentItemById(
      'pending-close',
    ) as ComponentItem;
    item.popout();

    expect(() => beforeUnload?.()).not.toThrow();
    expect(layout.findFirstComponentItemById('pending-close')).toBeDefined();
  });

  it('keeps the item in the layout when popup creation is blocked', function () {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

    layout.loadLayout({
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            id: 'blockedPopoutComponent',
            componentType: 'testComponent',
          },
        ],
      },
      settings: {
        blockedPopoutsThrowError: false,
      },
    });

    const item = layout.findFirstComponentItemById(
      'blockedPopoutComponent',
    ) as ComponentItem;
    item.popout();

    expect(
      layout.findFirstComponentItemById('blockedPopoutComponent'),
    ).toBeDefined();
    expect(
      layout.findFirstComponentItemById('blockedPopoutComponent')?.id,
    ).toBe(item.id);
    expect(layout.openPopouts.length).toBe(0);
    expect(removeItemSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^strelit-window-config-/),
    );
  });

  it('does not throw when calling close() on a blocked popout', function () {
    vi.spyOn(window, 'open').mockReturnValue(null);

    layout.loadLayout({
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            id: 'blockedPopoutComponent2',
            componentType: 'testComponent',
          },
        ],
      },
      settings: {
        blockedPopoutsThrowError: false,
      },
    });

    const item = layout.findFirstComponentItemById(
      'blockedPopoutComponent2',
    ) as ComponentItem;
    const popout = item.popout();

    expect(() => popout.close()).not.toThrow();
  });

  it('restores incoming openPopouts when loading a new layout config', function () {
    const mockWindow = {
      closed: false,
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      document: {
        createElement: () => document.createElement('div'),
        body: document.createElement('body'),
        head: document.createElement('head'),
        write: vi.fn(),
        close: vi.fn(),
      },
      location: { href: '' },
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(mockWindow);

    const createPopoutSpy = vi.spyOn(
      layout as unknown as {
        createPopoutFromPopoutLayoutConfig: (config: unknown) => unknown;
      },
      'createPopoutFromPopoutLayoutConfig',
    );

    layout.loadLayout({
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            componentType: 'testComponent',
          },
        ],
      },
      openPopouts: [
        {
          root: {
            type: 'component',
            componentType: 'testComponent',
          },
          parentId: null,
          indexInParent: null,
          window: {
            width: 320,
            height: 200,
          },
        },
      ],
    });

    expect(createPopoutSpy).toHaveBeenCalledTimes(1);
  });

  it('wraps a component root before restoring a popout without its parent', function () {
    const closeWindow = vi.fn();
    const childLayout = {
      isInitialised: false,
      saveLayout: () =>
        resolveLayoutConfig({
          root: {
            type: 'component',
            id: 'returned',
            componentType: 'testComponent',
          },
        }),
      closeWindow,
    };
    const mockWindow = {
      closed: false,
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      __strelitInstance: childLayout,
      document: {
        createElement: () => document.createElement('div'),
        body: document.createElement('body'),
        head: document.createElement('head'),
        write: vi.fn(),
        close: vi.fn(),
      },
      location: { href: '' },
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(mockWindow);
    layout.loadLayout({
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            id: 'departing',
            componentType: 'testComponent',
          },
        ],
      },
    });
    const departing = layout.findFirstComponentItemById(
      'departing',
    ) as ComponentItem;
    const popout = departing.popout();
    layout.loadComponentAsRoot({
      type: 'component',
      id: 'host',
      componentType: 'testComponent',
    });

    popout.popIn();

    expect(layout.rootItem?.type).toBe('row');
    expect(layout.rootItem?.contentItems.map((item) => item.id)).toEqual([
      'host',
      'returned',
    ]);
    expect(closeWindow).toHaveBeenCalledOnce();
  });

  it('wraps a stack root before restoring another stack without its parent', function () {
    const closeWindow = vi.fn();
    const childLayout = {
      isInitialised: false,
      saveLayout: () =>
        resolveLayoutConfig({
          root: {
            type: 'stack',
            id: 'returned-stack',
            content: [
              {
                type: 'component',
                id: 'returned-component',
                componentType: 'testComponent',
              },
            ],
          },
        }),
      closeWindow,
    };
    const mockWindow = {
      closed: false,
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      __strelitInstance: childLayout,
      document: {
        createElement: () => document.createElement('div'),
        body: document.createElement('body'),
        head: document.createElement('head'),
        write: vi.fn(),
        close: vi.fn(),
      },
      location: { href: '' },
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(mockWindow);
    layout.loadLayout({
      root: {
        type: 'stack',
        id: 'departing-stack',
        content: [
          {
            type: 'component',
            id: 'departing-component',
            componentType: 'testComponent',
          },
        ],
      },
    });
    const departing = layout.findFirstComponentItemById(
      'departing-component',
    ) as ComponentItem;
    const popout = departing.popout();
    layout.groundItem?.loadRoot(
      resolveLayoutConfig({
        root: {
          type: 'stack',
          id: 'host-stack',
          content: [
            {
              type: 'component',
              componentType: 'testComponent',
            },
          ],
        },
      }).root,
    );

    popout.popIn();

    expect(layout.rootItem?.type).toBe('row');
    expect(layout.rootItem?.contentItems.map((item) => item.id)).toEqual([
      'host-stack',
      'returned-stack',
    ]);
    expect(closeWindow).toHaveBeenCalledOnce();
  });

  it('emits closed once when manual pop-in also unloads the child', function () {
    vi.useFakeTimers();
    try {
      let beforeUnload: (() => void) | undefined;
      const childLayout = {
        isInitialised: false,
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              id: 'returned-once',
              componentType: 'testComponent',
            },
          }),
        closeWindow: () => {
          (mockWindow as unknown as { closed: boolean }).closed = true;
          beforeUnload?.();
        },
      };
      const mockWindow = {
        closed: false,
        close: vi.fn(),
        addEventListener: vi.fn((name: string, listener: () => void) => {
          if (name === 'beforeunload') {
            beforeUnload = listener;
          }
        }),
        removeEventListener: vi.fn(),
        __strelitInstance: childLayout,
        document: {
          createElement: () => document.createElement('div'),
          body: document.createElement('body'),
          head: document.createElement('head'),
          write: vi.fn(),
          close: vi.fn(),
        },
        location: { href: '' },
      } as unknown as Window;
      vi.spyOn(window, 'open').mockReturnValue(mockWindow);
      layout.loadLayout({
        root: {
          type: 'component',
          id: 'departing-once',
          componentType: 'testComponent',
        },
      });
      const departing = layout.findFirstComponentItemById(
        'departing-once',
      ) as ComponentItem;
      const popout = departing.popout();
      const closed = vi.fn();
      popout.on('closed', closed);

      popout.popIn();
      vi.advanceTimersByTime(50);

      expect(closed).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('continues close detection after a child-window reload', function () {
    vi.useFakeTimers();
    try {
      let beforeUnload: (() => void) | undefined;
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const childLayout = {
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              id: 'reload-popout',
              componentType: 'testComponent',
            },
          }),
        width: 320,
        height: 200,
      };
      const mockWindow = {
        closed: false,
        close: vi.fn(),
        addEventListener: vi.fn((name: string, listener: () => void) => {
          if (name === 'beforeunload') {
            beforeUnload = listener;
          }
        }),
        removeEventListener: vi.fn(),
        __strelitInstance: childLayout,
        document: {
          createElement: () => document.createElement('div'),
          body: document.createElement('body'),
          head: document.createElement('head'),
          write: vi.fn(),
          close: vi.fn(),
        },
        location: { href: '' },
      } as unknown as Window;
      vi.spyOn(window, 'open').mockReturnValue(mockWindow);
      layout.loadLayout({
        settings: { popInOnClose: true },
        root: {
          type: 'component',
          id: 'reload-popout',
          componentType: 'testComponent',
        },
      });
      const departing = layout.findFirstComponentItemById(
        'reload-popout',
      ) as ComponentItem;
      const popout = departing.popout();
      const closed = vi.fn();
      popout.on('closed', closed);
      vi.advanceTimersByTime(10);
      expect(
        layout.findFirstComponentItemById('reload-popout'),
      ).toBeUndefined();
      const storageKey = setItem.mock.calls.find(([key]) =>
        key.startsWith('strelit-window-config-'),
      )?.[0];
      expect(storageKey).toBeDefined();
      if (storageKey === undefined) {
        throw new Error('Expected a popout storage key');
      }

      mockWindow.__strelitInstance = undefined;
      beforeUnload?.();
      vi.advanceTimersByTime(50);
      expect(closed).not.toHaveBeenCalled();
      expect(
        layout.findFirstComponentItemById('reload-popout'),
      ).toBeUndefined();
      expect(localStorage.getItem(storageKey)).not.toBeNull();

      (mockWindow as unknown as { closed: boolean }).closed = true;
      vi.advanceTimersByTime(60);
      expect(closed).toHaveBeenCalledOnce();
      expect(layout.findFirstComponentItemById('reload-popout')).toBeDefined();
      expect(localStorage.getItem(storageKey)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

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

  it('keeps a pending popout only in the root snapshot', function () {
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

    const saved = layout.saveLayout();
    expect(saved.root?.id).toBe('pending');
    expect(saved.openPopouts).toHaveLength(0);
    expect(() => popout.getStrelitInstance()).toThrow(
      'UnexpectedUndefined: BPGGI24694',
    );
  });

  it('preserves a pending popout loaded from configuration', function () {
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
      openPopouts: [
        {
          parentId: 'persisted-parent',
          indexInParent: 1,
          root: {
            type: 'component',
            id: 'configured-pending',
            componentType: 'testComponent',
          },
        },
      ],
    });

    const saved = layout.saveLayout();
    expect(saved.root).toBeUndefined();
    expect(saved.openPopouts).toHaveLength(1);
    expect(saved.openPopouts[0].root?.id).toBe('configured-pending');
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
      const windowOpened = vi.fn(() => {
        expect(
          layout.findFirstComponentItemById('initialising-popout'),
        ).toBeUndefined();
        const saved = layout.saveLayout();
        expect(saved.root).toBeUndefined();
        expect(saved.openPopouts[0].root?.id).toBe('initialising-popout');
      });
      layout.on('windowOpened', windowOpened);

      item.popout();
      expect(layout.findFirstComponentItemById('initialising-popout')).toBe(
        item,
      );

      mockWindow.__strelitInstance = {
        closeWindow: vi.fn(),
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              id: 'initialising-popout',
              componentType: 'testComponent',
            },
          }),
        width: 320,
        height: 200,
      } as never;
      vi.advanceTimersByTime(10);

      expect(windowOpened).toHaveBeenCalledOnce();
      expect(
        layout.findFirstComponentItemById('initialising-popout'),
      ).toBeUndefined();
      const saved = layout.saveLayout();
      expect(saved.root).toBeUndefined();
      expect(saved.openPopouts[0].root?.id).toBe('initialising-popout');
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

  it('preserves configured popouts when popup creation is blocked', function () {
    vi.spyOn(window, 'open').mockReturnValue(null);
    layout.loadLayout({
      settings: { blockedPopoutsThrowError: false },
      openPopouts: [
        {
          root: {
            type: 'component',
            id: 'blocked-configured-popout',
            componentType: 'testComponent',
          },
        },
      ],
    });

    const saved = layout.saveLayout();

    expect(layout.openPopouts).toHaveLength(1);
    expect(saved.openPopouts).toHaveLength(1);
    expect(saved.openPopouts[0].root?.id).toBe('blocked-configured-popout');
  });

  it('rolls back partially opened popouts before replacing the root', function () {
    const oldWindowClose = vi.fn();
    const partialWindowClose = vi.fn();
    const createWindow = (close: ReturnType<typeof vi.fn>) =>
      ({
        closed: false,
        close,
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
      }) as unknown as Window;
    const oldWindow = createWindow(oldWindowClose);
    const partialWindow = createWindow(partialWindowClose);
    vi.spyOn(window, 'open')
      .mockReturnValueOnce(oldWindow)
      .mockReturnValueOnce(partialWindow)
      .mockReturnValueOnce(null);
    layout.loadLayout({
      root: {
        type: 'component',
        id: 'working-root',
        componentType: 'testComponent',
      },
      openPopouts: [
        {
          root: {
            type: 'component',
            componentType: 'testComponent',
          },
        },
      ],
    });
    const workingRoot = layout.rootItem;
    const existingPopout = layout.openPopouts[0];

    expect(() =>
      layout.loadLayout({
        root: {
          type: 'component',
          id: 'replacement-root',
          componentType: 'testComponent',
        },
        openPopouts: [
          {
            root: {
              type: 'component',
              componentType: 'testComponent',
            },
          },
          {
            root: {
              type: 'component',
              componentType: 'testComponent',
            },
          },
        ],
      }),
    ).toThrow('Popout blocked');

    expect(layout.rootItem).toBe(workingRoot);
    expect(layout.openPopouts).toEqual([existingPopout]);
    expect(oldWindowClose).not.toHaveBeenCalled();
    expect(partialWindowClose).toHaveBeenCalledOnce();
  });

  it('keeps existing popouts open when replacement post-processing fails', function () {
    const existingWindowClose = vi.fn();
    const existingWindow = {
      closed: false,
      close: existingWindowClose,
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
    vi.spyOn(window, 'open').mockReturnValue(existingWindow);
    layout.loadLayout({
      root: {
        type: 'component',
        id: 'working-root',
        componentType: 'testComponent',
      },
      openPopouts: [
        {
          root: {
            type: 'component',
            componentType: 'testComponent',
          },
        },
      ],
    });
    const workingRoot = layout.rootItem;
    const existingPopout = layout.openPopouts[0];
    vi.spyOn(
      layout as unknown as { adjustColumnsResponsive(): void },
      'adjustColumnsResponsive',
    ).mockImplementationOnce(() => {
      throw new Error('responsive adjustment failed');
    });

    expect(() =>
      layout.loadLayout({
        root: {
          type: 'component',
          id: 'replacement-root',
          componentType: 'testComponent',
        },
      }),
    ).toThrow('responsive adjustment failed');

    expect(layout.rootItem).toBe(workingRoot);
    expect(layout.openPopouts).toEqual([existingPopout]);
    expect(existingWindowClose).not.toHaveBeenCalled();
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

  it.each([
    { index: -3, expectedIds: ['returned', 'host'] },
    { index: 0.5, expectedIds: ['returned', 'host'] },
    { index: 99, expectedIds: ['host', 'returned'] },
  ])(
    'normalizes configured pop-in index $index before binding',
    ({ index, expectedIds }) => {
      const closeWindow = vi.fn();
      const childLayout = {
        isInitialised: true,
        on: vi.fn(),
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
              id: 'host',
              componentType: 'testComponent',
            },
          ],
        },
        openPopouts: [
          {
            root: {
              type: 'component',
              id: 'returned',
              componentType: 'testComponent',
            },
            parentId: 'return-parent',
            indexInParent: index,
          },
        ],
      });
      const parent = layout.rootItem;
      parent?.addPopInParentId('return-parent');
      const popout = layout.openPopouts[0] as unknown as {
        _isInitialised: boolean;
        popIn(): void;
      };
      popout._isInitialised = true;

      expect(() => popout.popIn()).not.toThrow();

      expect(parent?.contentItems.map((item) => item.id)).toEqual(expectedIds);
      expect(closeWindow).toHaveBeenCalledOnce();
    },
  );

  it('allows pop-in to retry after insertion fails', function () {
    let attempts = 0;
    layout.registerComponentFactoryFunction('flaky', () => {
      if (++attempts === 1) {
        throw new Error('transient bind failure');
      }
      return undefined;
    });
    const childLayout = {
      isInitialised: true,
      on: vi.fn(),
      saveLayout: () =>
        resolveLayoutConfig({
          root: {
            type: 'stack',
            id: 'retry-return-stack',
            content: [
              {
                type: 'component',
                id: 'retry-return',
                componentType: 'flaky',
              },
            ],
          },
        }),
      closeWindow: vi.fn(),
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
        type: 'component',
        id: 'host',
        componentType: 'testComponent',
      },
      openPopouts: [
        {
          root: {
            type: 'stack',
            id: 'retry-return-stack',
            content: [
              {
                type: 'component',
                id: 'retry-return',
                componentType: 'flaky',
              },
            ],
          },
          parentId: null,
        },
      ],
    });
    const popout = layout.openPopouts[0] as unknown as {
      _isInitialised: boolean;
      popIn(): void;
    };
    popout._isInitialised = true;
    const originalRoot = layout.rootItem;
    const destroyedRows: unknown[] = [];
    layout.on('itemDestroyed', (event) => {
      const target = event.target as unknown as { isRow: boolean };
      if (target.isRow) {
        destroyedRows.push(target);
      }
    });

    expect(() => popout.popIn()).toThrow('transient bind failure');
    expect(layout.rootItem).toBe(originalRoot);
    expect(layout.rootItem?.type).toBe('stack');
    expect(destroyedRows).toHaveLength(1);
    expect(() => popout.popIn()).not.toThrow();

    expect(attempts).toBe(2);
    expect(layout.findFirstComponentItemById('retry-return')).toBeDefined();
    expect(childLayout.closeWindow).toHaveBeenCalledOnce();
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

  it('closes an empty child window without trying to insert a root', function () {
    vi.useFakeTimers();
    let beforeUnload: (() => void) | undefined;
    const closeWindow = vi.fn();
    const mockWindow = {
      closed: false,
      close: vi.fn(),
      addEventListener: vi.fn((name: string, listener: () => void) => {
        if (name === 'beforeunload') {
          beforeUnload = listener;
        }
      }),
      removeEventListener: vi.fn(),
      __strelitInstance: {
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () => resolveLayoutConfig({}),
        closeWindow: () => {
          closeWindow();
          (mockWindow as unknown as { closed: boolean }).closed = true;
          beforeUnload?.();
        },
        width: 320,
        height: 200,
      },
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
      openPopouts: [
        {
          root: {
            type: 'component',
            componentType: 'testComponent',
          },
        },
      ],
    });
    const popout = layout.openPopouts[0];
    const closed = vi.fn();
    popout.on('closed', closed);

    try {
      expect(() => popout.popIn()).not.toThrow();
      vi.advanceTimersByTime(50);
      expect(closeWindow).toHaveBeenCalledOnce();
      expect(closed).toHaveBeenCalledOnce();
      expect(layout.openPopouts).toHaveLength(0);
      expect(layout.rootItem).toBeUndefined();
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
      expect(layout.saveLayout().openPopouts[0].root?.id).toBe('reload-popout');

      mockWindow.__strelitInstance = undefined;
      beforeUnload?.();
      vi.advanceTimersByTime(50);
      expect(popout.toConfig().root?.id).toBe('reload-popout');
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComponentContainer,
  StrelitLayout,
  LayoutConfig,
  ComponentItem,
  eventEmitterAllEventName,
  resolveLayoutConfig,
  createLayoutConfigFromResolved,
  minifyResolvedLayoutConfig,
} from '../../src';
import { RowOrColumn } from '../../src/ts/items/row-or-column';

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

  it('rejects a second content popout with a return ID already in use', function () {
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
    layout.loadLayout({
      root: {
        type: 'row',
        content: [
          { type: 'component', id: 'first', componentType: 'testComponent' },
          { type: 'component', id: 'second', componentType: 'testComponent' },
        ],
      },
    });
    const first = layout.findFirstComponentItemById('first') as ComponentItem;
    const second = layout.findFirstComponentItemById('second') as ComponentItem;
    const windowRect = { left: 0, top: 0, width: 300, height: 200 };

    const firstPopout = layout.createPopout(
      first,
      windowRect,
      'shared-return-id',
      0,
    );
    expect(() =>
      layout.createPopout(second, windowRect, 'shared-return-id', 1),
    ).toThrow('Pop-in parent ID is already in use: shared-return-id');
    const configRoot = resolveLayoutConfig({
      root: { type: 'component', componentType: 'testComponent' },
    }).root;
    expect(configRoot).toBeDefined();
    expect(() =>
      layout.createPopout(configRoot!, windowRect, 'shared-return-id', 1),
    ).toThrow('Pop-in parent ID is already in use: shared-return-id');
    expect(() =>
      layout.createPopoutFromPopoutLayoutConfig(firstPopout.toConfig()),
    ).toThrow('Pop-in parent ID is already in use: shared-return-id');
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(layout.openPopouts).toHaveLength(1);
    expect(layout.rootItem?.popInParentIds).toEqual(['shared-return-id']);
    expect(second.parent?.parent).toBe(layout.rootItem);
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
    expect(saved.root?.popInParentIds).toHaveLength(1);
    expect(saved.openPopouts).toHaveLength(0);
    expect(createLayoutConfigFromResolved(saved).root?.popInParentIds).toEqual(
      saved.root?.popInParentIds,
    );
    expect(() => popout.getStrelitInstance()).toThrow(
      'UnexpectedUndefined: BPGGI24694',
    );
  });

  it('uses cached popout configuration when the child becomes cross-origin during save', function () {
    let childAccessThrows = false;
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
    Object.defineProperty(mockWindow, '__strelitInstance', {
      configurable: true,
      get: () => {
        if (childAccessThrows) {
          throw new DOMException('Blocked by origin policy', 'SecurityError');
        }
        return undefined;
      },
    });
    vi.spyOn(window, 'open').mockReturnValue(mockWindow);
    layout.loadLayout({
      openPopouts: [
        {
          root: {
            type: 'component',
            id: 'cached-cross-origin-popout',
            componentType: 'testComponent',
          },
        },
      ],
    });
    childAccessThrows = true;

    try {
      expect(layout.saveLayout().openPopouts[0].root?.id).toBe(
        'cached-cross-origin-popout',
      );
    } finally {
      childAccessThrows = false;
    }
  });

  it('retains a real popout for retry when its child becomes inaccessible', function () {
    let childAccessThrows = false;
    const nativeClose = vi.fn(() => {
      (mockWindow as unknown as { closed: boolean }).closed = true;
    });
    const mockWindow = {
      closed: false,
      close: nativeClose,
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
    Object.defineProperty(mockWindow, '__strelitInstance', {
      configurable: true,
      get: () => {
        if (childAccessThrows) {
          throw new Error('cross-origin child access denied');
        }
        return undefined;
      },
    });
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
    childAccessThrows = true;

    expect(() => layout.closeAllOpenPopouts()).toThrow(
      'cross-origin child access denied',
    );
    expect(layout.openPopouts).toHaveLength(1);

    childAccessThrows = false;
    expect(() => layout.closeAllOpenPopouts()).not.toThrow();
    expect(nativeClose).toHaveBeenCalledOnce();
    expect(layout.openPopouts).toHaveLength(0);
  });

  it('retries a close request that silently leaves the child open', function () {
    vi.useFakeTimers();
    try {
      let closeAttempts = 0;
      const nativeClose = vi.fn(() => {
        if (++closeAttempts === 2) {
          (mockWindow as unknown as { closed: boolean }).closed = true;
        }
      });
      const mockWindow = {
        closed: false,
        close: nativeClose,
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
            root: {
              type: 'component',
              componentType: 'testComponent',
            },
          },
        ],
      });

      layout.closeAllOpenPopouts();
      expect(nativeClose).toHaveBeenCalledOnce();
      expect(layout.openPopouts).toHaveLength(1);
      vi.advanceTimersByTime(50);

      layout.closeAllOpenPopouts();
      expect(nativeClose).toHaveBeenCalledTimes(2);
      expect(layout.openPopouts).toHaveLength(0);
      vi.advanceTimersByTime(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps polling closure when an uninitialised child becomes inaccessible', function () {
    vi.useFakeTimers();
    try {
      let childAccessThrows = false;
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
      Object.defineProperty(mockWindow, '__strelitInstance', {
        configurable: true,
        get: () => {
          if (childAccessThrows) {
            throw new Error('cross-origin child access denied');
          }
          return undefined;
        },
      });
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
      childAccessThrows = true;

      expect(() => vi.advanceTimersByTime(30)).not.toThrow();
      expect(layout.openPopouts).toHaveLength(1);

      (mockWindow as unknown as { closed: boolean }).closed = true;
      expect(() => vi.advanceTimersByTime(60)).not.toThrow();
      expect(layout.openPopouts).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([false, true])(
    'stops inaccessible-child polling after destroy when closePopoutsOnUnload is %s',
    (closePopoutsOnUnload) => {
      vi.useFakeTimers();
      try {
        let childAccessThrows = false;
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
        Object.defineProperty(mockWindow, '__strelitInstance', {
          configurable: true,
          get: () => {
            if (childAccessThrows) {
              throw new Error('cross-origin child access denied');
            }
            return undefined;
          },
        });
        vi.spyOn(window, 'open').mockReturnValue(mockWindow);
        layout.loadLayout({
          settings: { closePopoutsOnUnload },
          openPopouts: [
            {
              root: {
                type: 'component',
                componentType: 'testComponent',
              },
            },
          ],
        });
        const popout = layout.openPopouts[0] as unknown as {
          _checkReadyInterval: ReturnType<typeof setInterval> | undefined;
        };
        childAccessThrows = true;

        if (closePopoutsOnUnload) {
          expect(() => layout.destroy()).toThrow(
            'cross-origin child access denied',
          );
        } else {
          expect(() => layout.destroy()).not.toThrow();
        }
        vi.advanceTimersByTime(10);

        expect(popout._checkReadyInterval).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each([false, true])(
    'does not reconcile a scheduled pop-in after destroy when closePopoutsOnUnload is %s',
    (closePopoutsOnUnload) => {
      vi.useFakeTimers();
      try {
        let beforeUnload: (() => void) | undefined;
        let childAccessThrows = false;
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
        Object.defineProperty(mockWindow, '__strelitInstance', {
          configurable: true,
          get: () => {
            if (childAccessThrows) {
              throw new Error('cross-origin child access denied');
            }
            return undefined;
          },
        });
        vi.spyOn(window, 'open').mockReturnValue(mockWindow);
        layout.loadLayout({
          settings: { closePopoutsOnUnload, popInOnClose: true },
          root: {
            type: 'component',
            id: 'destroyed-reconciliation-host',
            componentType: 'testComponent',
          },
          openPopouts: [
            {
              root: {
                type: 'component',
                id: 'must-not-enter-destroyed-layout',
                componentType: 'testComponent',
              },
              parentId: null,
            },
          ],
        });

        (mockWindow as unknown as { closed: boolean }).closed = true;
        beforeUnload?.();
        childAccessThrows = true;
        if (closePopoutsOnUnload) {
          expect(() => layout.destroy()).toThrow(
            'cross-origin child access denied',
          );
        } else {
          expect(() => layout.destroy()).not.toThrow();
        }

        expect(() => vi.advanceTimersByTime(50)).not.toThrow();
        expect(layout.groundItem).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('does not pop in after a delayed explicit close and reconciles duplicate signals once', function () {
    vi.useFakeTimers();
    try {
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
          id: 'delayed-close-host',
          componentType: 'testComponent',
        },
        openPopouts: [
          {
            root: {
              type: 'component',
              id: 'must-not-pop-in-after-explicit-close',
              componentType: 'testComponent',
            },
            parentId: null,
          },
        ],
      });
      const popout = layout.openPopouts[0] as unknown as {
        _checkReadyInterval: ReturnType<typeof setInterval> | undefined;
        on(name: 'closed', listener: () => void): void;
      };
      const closed = vi.fn();
      popout.on('closed', closed);

      layout.closeAllOpenPopouts();
      vi.advanceTimersByTime(50);
      expect(layout.openPopouts).toHaveLength(1);

      (mockWindow as unknown as { closed: boolean }).closed = true;
      beforeUnload?.();
      beforeUnload?.();
      vi.advanceTimersByTime(50);

      expect(closed).toHaveBeenCalledOnce();
      expect(layout.openPopouts).toHaveLength(0);
      expect(
        layout.findFirstComponentItemById(
          'must-not-pop-in-after-explicit-close',
        ),
      ).toBeUndefined();
      expect(popout._checkReadyInterval).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
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

  it('saves a just-closed child after restoring its source before the close timer', function () {
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
        settings: { popInOnClose: true },
        root: {
          type: 'component',
          id: 'quick-save',
          componentType: 'testComponent',
        },
      });
      const item = layout.findFirstComponentItemById(
        'quick-save',
      ) as ComponentItem;
      item.popout();
      mockWindow.__strelitInstance = {
        closeWindow: vi.fn(),
        isInitialised: true,
        on: vi.fn(),
        off: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              id: 'quick-save',
              componentType: 'testComponent',
            },
          }),
        width: 320,
        height: 200,
      } as never;
      vi.advanceTimersByTime(10);
      expect(layout.rootItem).toBeUndefined();

      (mockWindow as Window & { closed: boolean }).closed = true;
      const saved = layout.saveLayout();
      expect(saved.root).toMatchObject({
        type: 'stack',
        content: [{ id: 'quick-save' }],
      });
      expect(saved.openPopouts).toEqual([]);
      expect(layout.findFirstComponentItemById('quick-save')).toBeDefined();
      vi.advanceTimersByTime(60);
      expect(layout.findFirstComponentItemById('quick-save')).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a closed child return intact when its component factory saves the parent layout', function () {
    vi.useFakeTimers();
    try {
      let factoryCalls = 0;
      let savedInFactory: ReturnType<typeof layout.saveLayout> | undefined;
      let savedDuringInsertion:
        ReturnType<typeof layout.saveLayout> | undefined;
      layout.registerComponentFactoryFunction('reentrant', () => {
        factoryCalls++;
        if (factoryCalls === 2) {
          savedInFactory = layout.saveLayout();
        }
      });
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
        settings: { popInOnClose: true },
        root: {
          type: 'row',
          content: [
            {
              type: 'component',
              id: 'reentrant-side',
              componentType: 'testComponent',
            },
            {
              type: 'component',
              id: 'reentrant-return',
              componentType: 'reentrant',
            },
          ],
        },
      });
      const departing = layout.findFirstComponentItemById(
        'reentrant-return',
      ) as ComponentItem;
      departing.popout();
      mockWindow.__strelitInstance = {
        closeWindow: vi.fn(),
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              id: 'reentrant-return',
              componentType: 'reentrant',
            },
          }),
        width: 320,
        height: 200,
      } as never;
      vi.advanceTimersByTime(10);
      vi.spyOn(layout.openPopouts[0], 'getStrelitInstance').mockImplementation(
        () => {
          throw new Error('closed child is inaccessible');
        },
      );
      layout.on('stateChanged', () => {
        if (
          factoryCalls === 2 &&
          savedDuringInsertion === undefined &&
          layout.findFirstComponentItemById('reentrant-return') !== undefined
        ) {
          savedDuringInsertion = layout.saveLayout();
        }
      });
      (mockWindow as Window & { closed: boolean }).closed = true;

      const saved = layout.saveLayout();

      expect(factoryCalls).toBe(2);
      expect(savedInFactory?.openPopouts).toHaveLength(1);
      expect(savedDuringInsertion?.openPopouts).toHaveLength(0);
      expect(
        savedDuringInsertion?.root?.content.map((item) => item.id),
      ).toEqual(['reentrant-side', 'reentrant-return']);
      expect(
        layout.findFirstComponentItemById('reentrant-return'),
      ).toBeDefined();
      expect(layout.openPopouts).toHaveLength(0);
      expect(saved.root?.type).toBe('row');
      expect(saved.root?.content.map((item) => item.id)).toEqual([
        'reentrant-side',
        'reentrant-return',
      ]);
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

  it('does not rebase another return when an uninitialised popout kept its source', function () {
    vi.useFakeTimers();
    try {
      const windows = Array.from({ length: 2 }, () => ({
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
      }));
      vi.spyOn(window, 'open')
        .mockReturnValueOnce(windows[0] as unknown as Window)
        .mockReturnValueOnce(windows[1] as unknown as Window);
      layout.loadLayout({
        root: {
          type: 'row',
          content: ['A', 'B', 'C'].map((id, index) => ({
            type: 'component',
            id,
            componentType: 'testComponent',
            size: `${index === 2 ? 40 : 30}%`,
          })),
        },
      });
      const first = layout.findFirstComponentItemById('A') as ComponentItem;
      const second = layout.findFirstComponentItemById('B') as ComponentItem;
      const firstPopout = first.popout();
      const secondPopout = second.popout();
      const before = secondPopout.toConfig();

      windows[0].closed = true;
      const beforeUnload = windows[0].addEventListener.mock.calls.find(
        ([name]) => name === 'beforeunload',
      )?.[1] as (() => void) | undefined;
      expect(beforeUnload).toBeDefined();
      beforeUnload!();
      vi.advanceTimersByTime(60);

      expect(firstPopout.getWindow().closed).toBe(true);
      expect(layout.findFirstComponentItemById('A')).toBe(first);
      expect(secondPopout.toConfig().indexInParent).toBe(before.indexInParent);
      expect(secondPopout.toConfig().root?.size).toBe(before.root?.size);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps blocked popout attempts separate and leaves the item in the layout', function () {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null);
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
    item.popout();

    expect(openWindow).toHaveBeenCalledTimes(2);
    const [firstUrl, firstTarget] = openWindow.mock.calls[0];
    const [secondUrl, secondTarget] = openWindow.mock.calls[1];
    if (firstUrl === undefined || secondUrl === undefined) {
      throw new Error('Expected both popout URLs');
    }
    const firstKey = new URL(firstUrl).searchParams.get('strelit-window');
    const secondKey = new URL(secondUrl).searchParams.get('strelit-window');
    expect(firstTarget).not.toBe(secondTarget);
    expect(firstKey).toMatch(/^strelit-window-config-[0-9a-f]{32}$/);
    expect(secondKey).toMatch(/^strelit-window-config-[0-9a-f]{32}$/);
    expect(firstKey).not.toBe(secondKey);
    expect(removeItemSpy).toHaveBeenCalledWith(firstKey);
    expect(removeItemSpy).toHaveBeenCalledWith(secondKey);

    expect(
      layout.findFirstComponentItemById('blockedPopoutComponent'),
    ).toBeDefined();
    expect(
      layout.findFirstComponentItemById('blockedPopoutComponent')?.id,
    ).toBe(item.id);
    expect(layout.openPopouts.length).toBe(0);
    expect(layout.groundItem?.popInParentIds).toEqual([]);
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

  it('removes a blocked configured popout when all popouts are closed', function () {
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

    layout.closeAllOpenPopouts();

    expect(layout.openPopouts).toHaveLength(0);
    expect(layout.saveLayout().openPopouts).toHaveLength(0);
  });

  it('does not reconcile delayed popout closure after layout destruction', function () {
    vi.useFakeTimers();
    try {
      let beforeUnload: (() => void) | undefined;
      const childLayout = {
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              componentType: 'testComponent',
            },
          }),
        closeWindow: vi.fn(),
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
        openPopouts: [
          {
            root: {
              type: 'component',
              componentType: 'testComponent',
            },
          },
        ],
      });
      const browserPopout = layout.openPopouts[0];
      const initialised = vi.fn();
      const closed = vi.fn();
      browserPopout.on('initialised', initialised);
      browserPopout.on('closed', closed);
      const windowClosed = vi.fn();
      const stateChanged = vi.fn();
      layout.on('windowClosed', windowClosed);
      layout.on('stateChanged', stateChanged);

      layout.destroy();
      windowClosed.mockClear();
      stateChanged.mockClear();
      (mockWindow as unknown as { closed: boolean }).closed = true;
      beforeUnload?.();
      vi.advanceTimersByTime(50);

      expect(layout.openPopouts).toHaveLength(0);
      expect(initialised).not.toHaveBeenCalled();
      expect(closed).not.toHaveBeenCalled();
      expect(windowClosed).not.toHaveBeenCalled();
      expect(stateChanged).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('transfers surviving popout storage cleanup without retaining the layout', function () {
    vi.useFakeTimers();
    localStorage.clear();
    const listeners: Array<() => void> = [];
    const mockWindow = {
      closed: false,
      close: vi.fn(),
      addEventListener: vi.fn((name: string, listener: () => void) => {
        if (name === 'beforeunload') listeners.push(listener);
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
    const open = vi.spyOn(window, 'open').mockReturnValue(mockWindow);

    layout.loadLayout({
      settings: { closePopoutsOnUnload: false },
      openPopouts: [
        {
          root: {
            type: 'component',
            componentType: 'testComponent',
          },
        },
      ],
    });
    expect(open).toHaveBeenCalled();

    layout.destroy();

    const cleanupListener = listeners.at(-1);
    expect(cleanupListener).toBeDefined();
    expect(cleanupListener).not.toBe(listeners[0]);
    const storageKey = Object.keys(localStorage).find((key) =>
      key.startsWith('strelit-window-config-'),
    );
    expect(storageKey).toBeDefined();
    vi.advanceTimersByTime(50);
    expect(
      storageKey === undefined ? null : localStorage.getItem(storageKey),
    ).not.toBeNull();

    (mockWindow as unknown as { closed: boolean }).closed = true;
    vi.advanceTimersByTime(50);
    expect(
      storageKey === undefined ? null : localStorage.getItem(storageKey),
    ).toBeNull();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('does not emit windowOpened when popout initialisation destroys the owner', function () {
    vi.useFakeTimers();
    try {
      const childLayout = { isInitialised: true, on: vi.fn() };
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
      const resolved = resolveLayoutConfig({
        root: {
          type: 'component',
          componentType: 'testComponent',
        },
      });
      const config = {
        ...resolved,
        window: { width: 320, height: 200, left: 0, top: 0 },
        parentId: null,
        indexInParent: null,
      };
      const windowOpened = vi.fn();
      layout.on('windowOpened', windowOpened);

      const browserPopout = (
        layout as unknown as {
          createBrowserPopout(
            popoutConfig: typeof config,
            beforeWindowOpened: () => void,
          ): { on(eventName: 'initialised', listener: () => void): void };
        }
      ).createBrowserPopout(config, () => layout.destroy());
      const directInitialised = vi.fn();
      browserPopout.on('initialised', directInitialised);
      vi.advanceTimersByTime(10);

      expect(layout.isDestroyed).toBe(true);
      expect(windowOpened).not.toHaveBeenCalled();
      expect(directInitialised).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops closed dispatch when a layout listener destroys the owner', function () {
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
        openPopouts: [
          {
            root: {
              type: 'component',
              componentType: 'testComponent',
            },
          },
        ],
      });
      const browserPopout = layout.openPopouts[0];
      const directClosed = vi.fn();
      layout.on('windowClosed', () => layout.destroy());
      browserPopout.on('closed', directClosed);
      (mockWindow as unknown as { closed: boolean }).closed = true;

      (browserPopout as unknown as { _onClose(): void })._onClose();
      vi.advanceTimersByTime(50);

      expect(layout.isDestroyed).toBe(true);
      expect(directClosed).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops all-subscriber dispatch when an all listener destroys the owner', function () {
    vi.useFakeTimers();
    try {
      const mockWindow = {
        closed: false,
        close: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        __strelitInstance: { isInitialised: true, on: vi.fn() },
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
      const browserPopout = layout.openPopouts[0];
      const laterAllSubscriber = vi.fn();
      browserPopout.on(eventEmitterAllEventName, () => layout.destroy());
      browserPopout.on(eventEmitterAllEventName, laterAllSubscriber);

      vi.advanceTimersByTime(10);

      expect(layout.isDestroyed).toBe(true);
      expect(laterAllSubscriber).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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

  it('saves only the replacement when an old popup refuses to close', function () {
    vi.useFakeTimers();
    try {
      const createWindow = (close = vi.fn()) =>
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
      const oldWindowClose = vi.fn();
      const oldWindow = createWindow(oldWindowClose);
      const newWindow = createWindow();
      vi.spyOn(window, 'open')
        .mockReturnValueOnce(oldWindow)
        .mockReturnValueOnce(newWindow);
      const createConfig = (id: string) => ({
        root: {
          type: 'component' as const,
          id: `${id}-host`,
          componentType: 'testComponent',
        },
        openPopouts: [
          {
            root: {
              type: 'component' as const,
              id,
              componentType: 'testComponent',
            },
            parentId: 'shared-return-slot',
          },
        ],
      });

      layout.loadLayout(createConfig('old-child'));
      const oldPopout = layout.openPopouts[0];
      layout.loadLayout(createConfig('new-child'));
      vi.advanceTimersByTime(50);
      oldPopout.popIn();

      expect(oldWindowClose).toHaveBeenCalledOnce();
      expect(layout.findFirstComponentItemById('old-child')).toBeUndefined();
      expect(layout.openPopouts).toHaveLength(2);
      const saved = layout.saveLayout();
      expect(saved.openPopouts).toHaveLength(1);
      expect(saved.openPopouts[0].root?.id).toBe('new-child');
    } finally {
      vi.useRealTimers();
    }
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

    let savedWhileWrapping: ReturnType<typeof layout.saveLayout> | undefined;
    const addToRow = RowOrColumn.prototype.addChild;
    vi.spyOn(RowOrColumn.prototype, 'addChild').mockImplementation(
      function (this: RowOrColumn, item, index, suspendResize) {
        const result = addToRow.call(this, item, index, suspendResize);
        if (item.id === 'host') {
          savedWhileWrapping = layout.saveLayout();
        }
        return result;
      },
    );
    let savedDuringInsertion: ReturnType<typeof layout.saveLayout> | undefined;
    const groundItem = layout.groundItem!;
    const addChild = groundItem.addChild.bind(groundItem);
    vi.spyOn(groundItem, 'addChild').mockImplementation((item, index) => {
      const result = addChild(item, index);
      if (layout.findFirstComponentItemById('returned') !== undefined) {
        savedDuringInsertion = layout.saveLayout();
      }
      return result;
    });

    popout.popIn();

    expect(savedWhileWrapping?.root).toMatchObject({ id: 'host' });
    expect(savedWhileWrapping?.openPopouts).toHaveLength(1);
    expect(savedDuringInsertion?.root).toMatchObject({
      type: 'row',
      content: [{ id: 'host' }, { id: 'returned' }],
    });
    expect(savedDuringInsertion?.openPopouts).toEqual([]);
    expect(layout.rootItem?.type).toBe('row');
    expect(layout.rootItem?.contentItems.map((item) => item.id)).toEqual([
      'host',
      'returned',
    ]);
    expect(closeWindow).toHaveBeenCalledOnce();
  });

  it.each([
    { index: -3, expectedIds: ['returned', 'host'] },
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
        _initialisedStrelitInstance: typeof childLayout;
        popIn(): void;
      };
      popout._isInitialised = true;
      popout._initialisedStrelitInstance = childLayout;

      expect(() => popout.popIn()).not.toThrow();

      expect(parent?.contentItems.map((item) => item.id)).toEqual(expectedIds);
      expect(closeWindow).toHaveBeenCalledOnce();
    },
  );

  it('rejects a fractional configured pop-in index during layout resolution', () => {
    expect(() =>
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
            indexInParent: 0.5,
          },
        ],
      }),
    ).toThrow('PopoutLayoutConfig.indexInParent must be an integer or null');
  });

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

  it('keeps a closed popout serializable when automatic pop-in binding fails', function () {
    vi.useFakeTimers();
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    try {
      let beforeUnload: (() => void) | undefined;
      let attempts = 0;
      layout.registerComponentFactoryFunction('flaky-auto-popin', () => {
        if (++attempts === 1) {
          throw new Error('automatic pop-in bind failure');
        }
        return undefined;
      });
      const childLayout = {
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              id: 'failed-auto-popin',
              componentType: 'flaky-auto-popin',
            },
          }),
        closeWindow: vi.fn(),
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
          id: 'auto-popin-host',
          componentType: 'testComponent',
        },
        openPopouts: [
          {
            root: {
              type: 'component',
              id: 'failed-auto-popin',
              componentType: 'flaky-auto-popin',
            },
            parentId: null,
          },
        ],
      });
      const popout = layout.openPopouts[0];
      vi.advanceTimersByTime(10);

      (mockWindow as unknown as { closed: boolean }).closed = true;
      beforeUnload?.();
      expect(() => vi.advanceTimersByTime(50)).not.toThrow();

      expect(reportError).toHaveBeenCalledOnce();
      expect(
        layout.findFirstComponentItemById('failed-auto-popin'),
      ).toBeUndefined();
      expect(layout.saveLayout().openPopouts[0].root?.id).toBe(
        'failed-auto-popin',
      );

      expect(() => popout.popIn()).not.toThrow();
      vi.advanceTimersByTime(50);
      expect(
        layout.findFirstComponentItemById('failed-auto-popin'),
      ).toBeDefined();
      expect(layout.openPopouts).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('restores a wrapped root without re-entering failed GroundItem sizing', function () {
    vi.useFakeTimers();
    try {
      const childLayout = {
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'stack',
              id: 'returned-stack',
              content: [{ type: 'component', componentType: 'testComponent' }],
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
          type: 'stack',
          id: 'existing-stack',
          content: [{ type: 'component', componentType: 'testComponent' }],
        },
        openPopouts: [
          {
            root: {
              type: 'stack',
              id: 'returned-stack',
              content: [{ type: 'component', componentType: 'testComponent' }],
            },
            parentId: null,
          },
        ],
      });
      const originalRoot = layout.rootItem;
      const popout = layout.openPopouts[0] as unknown as {
        _isInitialised: boolean;
        _initialisedStrelitInstance: typeof childLayout;
        popIn(): void;
      };
      popout._isInitialised = true;
      popout._initialisedStrelitInstance = childLayout;
      vi.spyOn(layout.groundItem!, 'addChild').mockImplementation(() => {
        throw new Error('persistent pop-in insertion failure');
      });

      expect(() => popout.popIn()).toThrow(
        'persistent pop-in insertion failure',
      );

      expect(layout.rootItem).toBe(originalRoot);
      expect(originalRoot?.element.isConnected).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rolls back inserted content when closing the child throws and allows retry', function () {
    vi.useFakeTimers();
    try {
      let closeAttempts = 0;
      const childLayout = {
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              id: 'returned-after-close-error',
              componentType: 'testComponent',
            },
          }),
        closeWindow: vi.fn(() => {
          if (++closeAttempts === 1) {
            throw new Error('child close failed');
          }
          (mockWindow as unknown as { closed: boolean }).closed = true;
        }),
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
          id: 'host-after-close-error',
          componentType: 'testComponent',
        },
        openPopouts: [
          {
            root: {
              type: 'component',
              id: 'returned-after-close-error',
              componentType: 'testComponent',
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

      expect(() => popout.popIn()).toThrow('child close failed');
      expect(
        layout.findFirstComponentItemById('returned-after-close-error'),
      ).toBeDefined();
      vi.advanceTimersByTime(50);
      expect(
        layout.findFirstComponentItemById('returned-after-close-error'),
      ).toBeUndefined();

      expect(() => popout.popIn()).not.toThrow();
      expect(
        layout.findFirstComponentItemById('returned-after-close-error'),
      ).toBeDefined();
      vi.advanceTimersByTime(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it('commits inserted content when child closure completes before throwing', function () {
    vi.useFakeTimers();
    try {
      const childLayout = {
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              id: 'returned-after-close-and-throw',
              componentType: 'testComponent',
            },
          }),
        closeWindow: vi.fn(() => {
          (mockWindow as unknown as { closed: boolean }).closed = true;
          throw new Error('close reported late failure');
        }),
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
          id: 'host-after-close-and-throw',
          componentType: 'testComponent',
        },
        openPopouts: [
          {
            root: {
              type: 'component',
              id: 'returned-after-close-and-throw',
              componentType: 'testComponent',
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

      expect(() => popout.popIn()).toThrow('close reported late failure');
      vi.advanceTimersByTime(50);

      expect(
        layout.findFirstComponentItemById('returned-after-close-and-throw'),
      ).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rolls back inserted content when the child remains open', function () {
    vi.useFakeTimers();
    try {
      const childLayout = {
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              id: 'returned-from-still-open-child',
              componentType: 'testComponent',
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
          id: 'host-for-still-open-child',
          componentType: 'testComponent',
        },
        openPopouts: [
          {
            root: {
              type: 'component',
              id: 'returned-from-still-open-child',
              componentType: 'testComponent',
            },
            parentId: null,
          },
        ],
      });
      const popout = layout.openPopouts[0] as unknown as {
        _isInitialised: boolean;
        _initialisedStrelitInstance: typeof childLayout;
        popIn(): void;
      };
      popout._isInitialised = true;
      popout._initialisedStrelitInstance = childLayout;

      popout.popIn();
      expect(
        layout.findFirstComponentItemById('returned-from-still-open-child'),
      ).toBeDefined();
      vi.advanceTimersByTime(50);

      expect(
        layout.findFirstComponentItemById('returned-from-still-open-child'),
      ).toBeUndefined();
      expect(layout.openPopouts).toHaveLength(1);
      vi.advanceTimersByTime(10);
      expect(childLayout.on).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores sibling sizes when an attempted pop-in leaves the child open', function () {
    vi.useFakeTimers();
    try {
      const childLayout = {
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              id: 'returned-size',
              componentType: 'testComponent',
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
          type: 'row',
          content: [
            {
              type: 'component',
              id: 'left-size',
              componentType: 'testComponent',
              size: '30%',
            },
            {
              type: 'component',
              id: 'returned-size',
              componentType: 'testComponent',
              size: '30%',
            },
            {
              type: 'component',
              id: 'right-size',
              componentType: 'testComponent',
              size: '40%',
            },
          ],
        },
      });
      const departing = layout.findFirstComponentItemById(
        'returned-size',
      ) as ComponentItem;
      const popout = departing.popout();
      vi.advanceTimersByTime(10);
      const parent = layout.rootItem;
      if (parent === undefined) throw new Error('Expected return row');
      expect(parent.contentItems.map((item) => item.id)).toEqual([
        'left-size',
        'right-size',
      ]);
      const beforeSizes = parent.contentItems.map((item) => item.size);

      popout.popIn();
      expect(parent.contentItems.map((item) => item.size)).not.toEqual(
        beforeSizes,
      );
      vi.advanceTimersByTime(60);

      expect(parent.contentItems.map((item) => item.id)).toEqual([
        'left-size',
        'right-size',
      ]);
      expect(parent.contentItems.map((item) => item.size)).toEqual(beforeSizes);
      expect(layout.openPopouts).toHaveLength(1);

      const updateSize = parent.updateSize.bind(parent);
      vi.spyOn(parent, 'updateSize')
        .mockImplementationOnce((force) => updateSize(force))
        .mockImplementationOnce(() => {
          throw new Error('return resize failed');
        });
      expect(() => popout.popIn()).toThrow('return resize failed');
      expect(parent.contentItems.map((item) => item.id)).toEqual([
        'left-size',
        'right-size',
      ]);
      expect(parent.contentItems.map((item) => item.size)).toEqual(beforeSizes);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries an asynchronous pop-in rollback that fails transiently', function () {
    vi.useFakeTimers();
    try {
      const childLayout = {
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              id: 'returned-after-rollback-retry',
              componentType: 'testComponent',
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
          id: 'rollback-retry-host',
          componentType: 'testComponent',
        },
        openPopouts: [
          {
            root: {
              type: 'component',
              id: 'returned-after-rollback-retry',
              componentType: 'testComponent',
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
      const parent = layout.rootItem;
      if (parent === undefined) {
        throw new Error('Expected a pop-in parent');
      }
      vi.spyOn(parent, 'removeChild').mockImplementationOnce(() => {
        throw new Error('transient rollback failure');
      });

      popout.popIn();
      vi.advanceTimersByTime(50);
      expect(
        layout.findFirstComponentItemById('returned-after-rollback-retry'),
      ).toBeDefined();

      vi.advanceTimersByTime(250);
      expect(
        layout.findFirstComponentItemById('returned-after-rollback-retry'),
      ).toBeUndefined();
      expect(childLayout.on).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
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
      const storageKey = setItem.mock.calls.find(([key]) =>
        key.startsWith('strelit-window-config-'),
      )?.[0];
      if (storageKey === undefined) {
        throw new Error('Expected a popout storage key');
      }
      const closed = vi.fn(() => {
        throw new Error('closed listener failed');
      });
      const reportError = vi.fn();
      vi.stubGlobal('reportError', reportError);
      popout.on('closed', closed);

      popout.popIn();
      vi.advanceTimersByTime(50);

      expect(closed).toHaveBeenCalledOnce();
      expect(localStorage.getItem(storageKey)).toBeNull();
      expect(reportError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'closed listener failed' }),
      );
    } finally {
      vi.unstubAllGlobals();
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

  it('restores an initialized child closed without beforeunload', function () {
    vi.useFakeTimers();
    try {
      const childLayout = {
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              id: 'closed-without-unload',
              componentType: 'testComponent',
            },
          }),
        width: 320,
        height: 200,
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
        settings: { popInOnClose: true },
        root: {
          type: 'component',
          id: 'closed-without-unload',
          componentType: 'testComponent',
        },
      });
      const departing = layout.findFirstComponentItemById(
        'closed-without-unload',
      ) as ComponentItem;
      const popout = departing.popout() as unknown as {
        _checkReadyInterval: ReturnType<typeof setInterval> | undefined;
        on(name: 'closed' | 'initialised', listener: () => void): void;
      };
      const closed = vi.fn();
      popout.on('closed', closed);
      popout.on('initialised', () => {
        throw new Error('initialised observer failed');
      });
      expect(() => vi.advanceTimersByTime(10)).toThrow(
        'initialised observer failed',
      );
      expect(
        layout.findFirstComponentItemById('closed-without-unload'),
      ).toBeUndefined();

      let childInstanceReads = 0;
      Object.defineProperty(mockWindow, '__strelitInstance', {
        configurable: true,
        get: () => {
          childInstanceReads++;
          return childLayout;
        },
      });
      vi.advanceTimersByTime(500);
      expect(childInstanceReads).toBeLessThanOrEqual(3);

      (mockWindow as unknown as { closed: boolean }).closed = true;
      vi.advanceTimersByTime(310);

      expect(closed).toHaveBeenCalledOnce();
      expect(layout.openPopouts).toHaveLength(0);
      expect(
        layout.findFirstComponentItemById('closed-without-unload'),
      ).toBeDefined();
      expect(popout._checkReadyInterval).toBeUndefined();
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

      (
        mockWindow as unknown as { __strelitInstance: unknown }
      ).__strelitInstance = undefined;
      beforeUnload?.();
      vi.advanceTimersByTime(50);
      expect(popout.toConfig().root?.id).toBe('reload-popout');
      expect(closed).not.toHaveBeenCalled();
      expect(
        layout.findFirstComponentItemById('reload-popout'),
      ).toBeUndefined();
      expect(localStorage.getItem(storageKey)).not.toBeNull();

      let childInstanceReads = 0;
      Object.defineProperty(mockWindow, '__strelitInstance', {
        configurable: true,
        get: () => {
          childInstanceReads++;
          return undefined;
        },
      });
      vi.advanceTimersByTime(500);
      expect(childInstanceReads).toBeLessThanOrEqual(3);

      (mockWindow as unknown as { closed: boolean }).closed = true;
      vi.advanceTimersByTime(310);
      expect(closed).toHaveBeenCalledOnce();
      expect(layout.findFirstComponentItemById('reload-popout')).toBeDefined();
      expect(localStorage.getItem(storageKey)).toBeNull();
      vi.unstubAllGlobals();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rebinds popIn once when a reload creates a new child layout', function () {
    vi.useFakeTimers();
    try {
      let beforeUnload: (() => void) | undefined;
      const firstChild = {
        isInitialised: true,
        on: vi.fn(),
        off: vi.fn(),
      };
      const secondChild = {
        isInitialised: true,
        on: vi.fn(),
        off: vi.fn(),
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
        __strelitInstance: firstChild,
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
      const initialised = vi.fn();
      popout.on('initialised', initialised);

      vi.advanceTimersByTime(10);
      expect(firstChild.on).toHaveBeenCalledOnce();
      expect(initialised).toHaveBeenCalledOnce();

      beforeUnload?.();
      vi.advanceTimersByTime(50);
      (
        mockWindow as unknown as { __strelitInstance: unknown }
      ).__strelitInstance = secondChild;
      vi.advanceTimersByTime(250);

      expect(firstChild.on).toHaveBeenCalledOnce();
      expect(firstChild.off).toHaveBeenCalledWith(
        'popIn',
        expect.any(Function),
      );
      expect(secondChild.on).toHaveBeenCalledOnce();
      expect(secondChild.on).toHaveBeenCalledWith(
        'popIn',
        expect.any(Function),
      );
      expect(initialised).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('popout subwindow container selection', () => {
  const originalHref = window.location.href;
  const storageKey = 'strelit-window-config-test-subwindow';

  beforeEach(() => {
    const resolvedConfig = resolveLayoutConfig({
      root: {
        type: 'stack',
        content: [{ type: 'component', componentType: 'testComponent' }],
      },
    });
    localStorage.setItem(
      storageKey,
      JSON.stringify(minifyResolvedLayoutConfig(resolvedConfig)),
    );
    const subWindowUrl = new URL(originalHref);
    subWindowUrl.searchParams.set('strelit-window', storageKey);
    window.history.replaceState({}, '', subWindowUrl.toString());
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.removeItem(storageKey);
    window.history.replaceState({}, '', originalHref);
  });

  it('mounts deferred subwindow content in body after clearing a supplied container', async () => {
    const { StrelitLayout: SubwindowLayout } =
      await import('../../src/ts/strelit-layout');
    const hostContainer = document.createElement('div');
    document.body.appendChild(hostContainer);
    const subLayout = new SubwindowLayout(hostContainer);

    try {
      subLayout.registerComponentFactoryFunction(
        'testComponent',
        (container) => {
          container.element.textContent = 'subwindow content';
        },
      );
      subLayout.registerComponentFactoryFunction('replacement', (container) => {
        container.element.textContent = 'replacement content';
      });

      expect(subLayout.isSubWindow).toBe(true);
      expect(() => subLayout.loadLayout({})).toThrow(
        'Cannot load a layout before initialization',
      );

      await vi.waitFor(() => expect(subLayout.isInitialised).toBe(true));
      expect(subLayout.container).toBe(document.body);
      expect(hostContainer.isConnected).toBe(false);
      expect(document.body.textContent).toContain('subwindow content');
      expect(document.body.querySelector('.lm_header')).not.toBeNull();
      expect(document.body.querySelector('.lm_popout')).toBeNull();
      expect(document.body.querySelector('.lm_stack .lm_close')).toBeNull();

      (document.body.querySelector('.lm_close_tab') as HTMLElement).click();
      expect(document.body.querySelector('.lm_tab')).toBeNull();
      expect(document.body.textContent).not.toContain('subwindow content');

      subLayout.loadLayout({
        root: {
          type: 'stack',
          content: [{ type: 'component', componentType: 'replacement' }],
        },
      });
      expect(document.body.textContent).toContain('replacement content');
      expect(document.body.textContent).not.toContain('subwindow content');

      (document.body.querySelector('.lm_close_tab') as HTMLElement).click();
      expect(subLayout.rootItem).toBeUndefined();
      expect(document.body.textContent).not.toContain('replacement content');
    } finally {
      subLayout.destroy();
    }
  });

  it('hides stack close controls in a multi-stack subwindow while keeping tab close controls', async () => {
    const { StrelitLayout: SubwindowLayout } =
      await import('../../src/ts/strelit-layout');
    const hostContainer = document.createElement('div');
    document.body.appendChild(hostContainer);
    const subLayout = new SubwindowLayout(hostContainer);

    try {
      subLayout.registerComponentFactoryFunction('testComponent', () => {});
      subLayout.registerComponentFactoryFunction('replacement', () => {});
      await vi.waitFor(() => expect(subLayout.isInitialised).toBe(true));
      const popIn = vi.fn();
      subLayout.on('popIn', popIn);
      subLayout.loadLayout({
        root: {
          type: 'row',
          content: [
            {
              type: 'stack',
              content: [{ type: 'component', componentType: 'testComponent' }],
            },
            {
              type: 'stack',
              content: [{ type: 'component', componentType: 'replacement' }],
            },
          ],
        },
      });

      expect(document.body.querySelectorAll('.lm_stack')).toHaveLength(2);
      expect(
        document.body.querySelectorAll('.lm_stack .lm_close'),
      ).toHaveLength(0);
      expect(document.body.querySelectorAll('.lm_close_tab')).toHaveLength(2);
      expect(popIn).not.toHaveBeenCalled();
    } finally {
      subLayout.destroy();
    }
  });

  it('closes only the selected last tab when other subwindow stacks remain', async () => {
    const { StrelitLayout: SubwindowLayout } =
      await import('../../src/ts/strelit-layout');
    const hostContainer = document.createElement('div');
    document.body.appendChild(hostContainer);
    const subLayout = new SubwindowLayout(hostContainer);

    try {
      subLayout.registerComponentFactoryFunction('testComponent', () => {});
      subLayout.registerComponentFactoryFunction('replacement', () => {});
      await vi.waitFor(() => expect(subLayout.isInitialised).toBe(true));
      const popIn = vi.fn();
      subLayout.on('popIn', popIn);
      subLayout.loadLayout({
        root: {
          type: 'row',
          content: [
            {
              type: 'stack',
              content: [{ type: 'component', componentType: 'testComponent' }],
            },
            {
              type: 'stack',
              content: [{ type: 'component', componentType: 'replacement' }],
            },
          ],
        },
      });

      expect(document.body.querySelectorAll('.lm_stack')).toHaveLength(2);
      (document.body.querySelector('.lm_close_tab') as HTMLElement).click();
      expect(popIn).not.toHaveBeenCalled();
      expect(document.body.querySelectorAll('.lm_stack')).toHaveLength(1);

      (document.body.querySelector('.lm_close_tab') as HTMLElement).click();
      expect(popIn).toHaveBeenCalledOnce();
      expect(document.body.querySelectorAll('.lm_stack')).toHaveLength(1);
    } finally {
      subLayout.destroy();
    }
  });

  it('keeps the supplied container when bindings initialize a subwindow synchronously', async () => {
    const { StrelitLayout: SubwindowLayout } =
      await import('../../src/ts/strelit-layout');
    const hostContainer = document.createElement('div');
    document.body.appendChild(hostContainer);
    const subLayout = new SubwindowLayout(
      hostContainer,
      (container) => {
        container.element.textContent = 'bound subwindow content';
        return { component: undefined, virtual: false };
      },
      () => {},
    );

    try {
      expect(subLayout.isSubWindow).toBe(true);
      expect(subLayout.isInitialised).toBe(true);
      expect(subLayout.container).toBe(hostContainer);
      expect(hostContainer.isConnected).toBe(true);
      expect(hostContainer.textContent).toContain('bound subwindow content');
      expect(hostContainer.querySelector('.lm_header')).not.toBeNull();
      expect(hostContainer.querySelector('.lm_popout')).toBeNull();
      expect(hostContainer.querySelector('.lm_stack .lm_close')).toBeNull();
    } finally {
      subLayout.destroy();
      hostContainer.remove();
    }
  });
});

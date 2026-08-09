import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ComponentContainer,
  type ComponentContainerBindableComponent,
  type ComponentContainerComponent,
  ComponentItem,
  type LayoutConfig,
  LayoutManager,
  resolveLayoutConfig,
  type ResolvedComponentItemConfig,
  StrelitLayout,
  Stack,
  VirtualLayout,
} from '../../src';
import { eventHubChildEventName } from '../../src/ts/utils/event-hub';

class SubwindowTestLayout extends LayoutManager {
  initialisedDuringBind = false;
  saveLayoutDuringBindSucceeded = false;

  constructor(
    config: LayoutConfig,
    private readonly failDuringBind = false,
  ) {
    super({
      containerElement: document.createElement('div'),
      isSubWindow: true,
      subWindowLayoutConfig: config,
    });
  }

  bindComponent(
    _container: ComponentContainer,
    _itemConfig: ResolvedComponentItemConfig,
  ): ComponentContainerBindableComponent {
    if (this.failDuringBind) {
      throw new Error('component factory failed');
    }
    this.initialisedDuringBind = this.isInitialised;
    this.saveLayout();
    this.saveLayoutDuringBindSucceeded = true;
    return { component: undefined, virtual: false };
  }

  unbindComponent(
    _container: ComponentContainer,
    _virtual: boolean,
    _component: ComponentContainerComponent | undefined,
  ): void {}
}

describe('layout lifecycle', () => {
  const layouts: LayoutManager[] = [];

  afterEach(() => {
    for (const layout of layouts) {
      layout.destroy();
    }
  });

  it('does not initialize an initialized layout again', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    const groundItem = layout.groundItem;
    const containerChildCount = layout.container.childElementCount;

    layout.init();

    expect(layout.groundItem).toBe(groundItem);
    expect(layout.container.childElementCount).toBe(containerChildCount);
  });

  it('does not initialize after being destroyed before initialization', () => {
    const removeEventListener = vi.spyOn(globalThis, 'removeEventListener');
    const layout = new VirtualLayout(undefined, undefined, undefined, true);
    layouts.push(layout);

    layout.destroy();
    layout.init();

    expect(layout.isDestroyed).toBe(true);
    expect(layout.isInitialised).toBe(false);
    expect(layout.groundItem).toBeUndefined();
    expect(removeEventListener).toHaveBeenCalledWith(
      eventHubChildEventName,
      expect.any(Function),
    );
  });

  it('applies maximised state after loading a subwindow root', () => {
    const layout = new SubwindowTestLayout({
      root: {
        type: 'stack',
        id: 'maximised-subwindow-stack',
        maximised: true,
        content: [{ type: 'component', componentType: 'panel' }],
      },
    });
    layouts.push(layout);

    layout.init();

    expect(layout.maximisedStack?.id).toBe('maximised-subwindow-stack');
    expect(layout.initialisedDuringBind).toBe(true);
    expect(layout.saveLayoutDuringBindSucceeded).toBe(true);
  });

  it('focuses a component installed directly as the root', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadComponentAsRoot({
      type: 'component',
      id: 'root-component',
      componentType: 'panel',
    });
    const root = layout.rootItem;
    if (root === undefined || !root.isComponent) {
      throw new Error('Expected a component root');
    }
    const componentRoot = root as ComponentItem;

    componentRoot.focus();

    expect(layout.focusedComponentItem).toBe(componentRoot);
    expect(layout.focusedComponentItem?.focused).toBe(true);
  });

  it('validates a root component before removing the current layout', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadComponentAsRoot({
      type: 'component',
      id: 'working-root',
      componentType: 'panel',
    });
    const workingRoot = layout.rootItem;

    expect(() =>
      layout.loadComponentAsRoot({
        type: 'component',
        componentType: 'panel',
        maximised: true,
      }),
    ).toThrow('Root Component cannot be maximised');
    expect(layout.rootItem).toBe(workingRoot);
  });

  it('preserves the working root when replacement creation fails', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('working', () => undefined);
    layout.registerComponentFactoryFunction('failing', () => {
      throw new Error('component factory failed');
    });
    layout.loadLayout({
      root: {
        type: 'component',
        id: 'working-root',
        componentType: 'working',
      },
    });
    const workingRoot = layout.rootItem;
    const workingConfig = layout.layoutConfig;

    expect(() =>
      layout.loadLayout({
        root: {
          type: 'component',
          id: 'failing-root',
          componentType: 'failing',
        },
      }),
    ).toThrow('component factory failed');
    expect(layout.rootItem).toBe(workingRoot);
    expect(layout.layoutConfig).toBe(workingConfig);
  });

  it('restores the working root when replacement sizing fails after attachment', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadLayout({
      root: {
        type: 'component',
        id: 'working-root',
        componentType: 'panel',
      },
    });
    const groundItem = layout.groundItem;
    const workingRoot = layout.rootItem;
    const workingConfig = layout.layoutConfig;
    if (groundItem === undefined) {
      throw new Error('Expected a ground item');
    }
    vi.spyOn(groundItem, 'updateSize').mockImplementationOnce(() => {
      throw new Error('virtual recting failed');
    });

    expect(() =>
      layout.loadLayout({
        root: {
          type: 'component',
          id: 'replacement-root',
          componentType: 'panel',
        },
      }),
    ).toThrow('virtual recting failed');

    expect(layout.rootItem).toBe(workingRoot);
    expect(layout.layoutConfig).toBe(workingConfig);
    expect(
      (workingRoot as unknown as { _isDestroyed: boolean })._isDestroyed,
    ).toBe(false);
    expect(workingRoot?.element.isConnected).toBe(true);
    expect(
      (
        layout as unknown as {
          _registeredComponentMap: Map<unknown, unknown>;
        }
      )._registeredComponentMap.size,
    ).toBe(1);
    expect(
      layout.findFirstComponentItemById('replacement-root'),
    ).toBeUndefined();
  });

  it('preserves live component instances when responsive post-processing fails', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    const workingComponent = { id: 'working-component' };
    const workingFactory = vi.fn(() => workingComponent);
    layout.registerComponentFactoryFunction('working', workingFactory);
    layout.registerComponentFactoryFunction('replacement', () => ({
      id: 'replacement-component',
    }));
    layout.loadLayout({
      root: {
        type: 'component',
        id: 'working-root',
        componentType: 'working',
      },
    });
    const workingRoot = layout.rootItem;
    const workingConfig = layout.layoutConfig;
    vi.spyOn(
      layout as unknown as { adjustColumnsResponsive(): void },
      'adjustColumnsResponsive',
    ).mockImplementationOnce(() => {
      throw new Error('responsive post-processing failed');
    });

    expect(() =>
      layout.loadLayout({
        root: {
          type: 'component',
          id: 'replacement-root',
          componentType: 'replacement',
        },
      }),
    ).toThrow('responsive post-processing failed');

    expect(layout.rootItem).toBe(workingRoot);
    expect(layout.layoutConfig).toBe(workingConfig);
    expect(workingFactory).toHaveBeenCalledOnce();
    expect(
      layout.findFirstComponentItemById('working-root')?.container.component,
    ).toBe(workingComponent);
  });

  it('restores component focus when layout replacement rolls back', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadLayout({
      root: {
        type: 'component',
        id: 'working-root',
        componentType: 'panel',
      },
    });
    const workingRoot = layout.findFirstComponentItemById('working-root');
    workingRoot?.focus();
    vi.spyOn(
      layout as unknown as { adjustColumnsResponsive(): void },
      'adjustColumnsResponsive',
    ).mockImplementationOnce(() => {
      layout.findFirstComponentItemById('replacement-root')?.focus();
      throw new Error('responsive post-processing failed');
    });

    expect(() =>
      layout.loadLayout({
        root: {
          type: 'component',
          id: 'replacement-root',
          componentType: 'panel',
        },
      }),
    ).toThrow('responsive post-processing failed');

    expect(layout.focusedComponentItem).toBe(workingRoot);
    expect(workingRoot?.focused).toBe(true);
  });

  it('preserves the load failure when silent focus restoration encounters a throwing listener', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadLayout({
      root: {
        type: 'component',
        id: 'working-root',
        componentType: 'panel',
      },
    });
    const workingRoot = layout.findFirstComponentItemById('working-root');
    workingRoot?.focus();
    const focusObserver = vi.fn(() => {
      throw new Error('focus observer failed');
    });
    workingRoot?.on('focus', focusObserver);
    vi.spyOn(
      layout as unknown as { adjustColumnsResponsive(): void },
      'adjustColumnsResponsive',
    ).mockImplementationOnce(() => {
      throw new Error('responsive post-processing failed');
    });

    expect(() =>
      layout.loadLayout({
        root: {
          type: 'stack',
          maximised: true,
          content: [
            {
              type: 'component',
              id: 'replacement-root',
              componentType: 'panel',
            },
          ],
        },
      }),
    ).toThrow('responsive post-processing failed');

    expect(focusObserver).not.toHaveBeenCalled();
    expect(layout.focusedComponentItem).toBe(workingRoot);
    expect(workingRoot?.focused).toBe(true);
  });

  it('commits the replacement when an old child close request fails', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('working', () => undefined);
    const nativeClose = vi.fn();
    const mockWindowState = { closed: false };
    const mockWindow = {
      get closed() {
        return mockWindowState.closed;
      },
      close: nativeClose,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      __strelitInstance: {
        isInitialised: true,
        on: vi.fn(),
        saveLayout: () =>
          resolveLayoutConfig({
            root: {
              type: 'component',
              componentType: 'working',
            },
          }),
        closeWindow: () => {
          throw new Error('old popout close failed');
        },
        width: 320,
        height: 200,
      },
      document: {
        createElement: () => document.createElement('div'),
        body: document.createElement('body'),
        head: document.createElement('head'),
      },
      location: { href: '' },
    } as unknown as Window;
    nativeClose.mockImplementation(() => {
      mockWindowState.closed = true;
    });
    vi.spyOn(globalThis, 'open').mockReturnValue(mockWindow);
    layout.loadLayout({
      root: {
        type: 'component',
        id: 'working-root',
        componentType: 'working',
      },
      openPopouts: [
        {
          root: {
            type: 'component',
            componentType: 'working',
          },
        },
      ],
    });

    expect(() =>
      layout.loadLayout({
        root: {
          type: 'component',
          id: 'replacement-root',
          componentType: 'working',
        },
      }),
    ).not.toThrow();

    expect(layout.rootItem?.id).toBe('replacement-root');
    expect(nativeClose).toHaveBeenCalledOnce();
    expect(layout.openPopouts).toHaveLength(0);
  });

  it('reports old-root cleanup failure after committing its replacement', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadLayout({
      root: {
        type: 'component',
        id: 'working-root',
        componentType: 'panel',
      },
    });
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    vi.spyOn(layout, 'unbindComponent').mockImplementationOnce(() => {
      throw new Error('old root cleanup failed');
    });

    try {
      expect(() =>
        layout.loadLayout({
          root: {
            type: 'component',
            id: 'replacement-root',
            componentType: 'panel',
          },
        }),
      ).not.toThrow();

      expect(layout.rootItem?.id).toBe('replacement-root');
      expect(reportError).toHaveBeenCalledOnce();
      expect(reportError.mock.calls[0][0]).toEqual(
        expect.objectContaining({ message: 'old root cleanup failed' }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps a failed old popout after committing the replacement layout', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadLayout({
      root: {
        type: 'component',
        id: 'working-root',
        componentType: 'panel',
      },
    });
    let closeAttempts = 0;
    const failedPopout = {
      close: vi.fn(() => {
        if (++closeAttempts === 1) {
          throw new Error('old popout close failed');
        }
      }),
      getWindow: () => ({ closed: closeAttempts > 1 }),
    };
    const internals = layout as unknown as {
      _openPopouts: (typeof failedPopout)[];
    };
    internals._openPopouts.push(failedPopout);
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);

    try {
      expect(() =>
        layout.loadLayout({
          root: {
            type: 'component',
            id: 'replacement-root',
            componentType: 'panel',
          },
        }),
      ).not.toThrow();

      expect(layout.rootItem?.id).toBe('replacement-root');
      expect(failedPopout.close).toHaveBeenCalledOnce();
      expect(layout.openPopouts).toEqual([failedPopout]);
      expect(reportError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'old popout close failed' }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('retains an old popout whose close is not confirmed', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadLayout({
      root: { type: 'component', componentType: 'panel' },
    });
    let closed = false;
    const popout = {
      close: vi.fn(),
      getWindow: () => ({ closed }),
    };
    (
      layout as unknown as { _openPopouts: (typeof popout)[] }
    )._openPopouts.push(popout);

    layout.loadLayout({
      root: {
        type: 'component',
        id: 'replacement-root',
        componentType: 'panel',
      },
    });

    expect(layout.rootItem?.id).toBe('replacement-root');
    expect(layout.openPopouts).toEqual([popout]);
    closed = true;
  });

  it('retries stack cleanup without repeating destruction events', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadLayout({
      root: {
        type: 'stack',
        content: [{ type: 'component', componentType: 'panel' }],
      },
    });
    const root = layout.rootItem;
    if (root === undefined || !root.isStack) {
      throw new Error('Expected a stack root');
    }
    const stack = root as Stack;
    const beforeItemDestroyed = vi.fn();
    const itemDestroyed = vi.fn();
    const headerDestroy = vi.fn(() => {
      throw new Error('header observer failed');
    });
    const laterHeaderDestroy = vi.fn();
    stack.on('beforeItemDestroyed', beforeItemDestroyed);
    stack.on('itemDestroyed', itemDestroyed);
    stack.header.on('destroy', headerDestroy);
    stack.header.on('destroy', laterHeaderDestroy);

    expect(() => stack.destroy()).toThrow('header observer failed');
    const beforeEventCount = beforeItemDestroyed.mock.calls.length;
    const destroyedEventCount = itemDestroyed.mock.calls.length;
    expect(() => stack.destroy()).not.toThrow();

    expect(beforeEventCount).toBeGreaterThan(0);
    expect(destroyedEventCount).toBeGreaterThan(0);
    expect(beforeItemDestroyed).toHaveBeenCalledTimes(beforeEventCount);
    expect(itemDestroyed).toHaveBeenCalledTimes(destroyedEventCount);
    expect(headerDestroy).toHaveBeenCalledOnce();
    expect(laterHeaderDestroy).toHaveBeenCalledOnce();
    expect(stack.header.element.isConnected).toBe(false);
  });

  it.each([1, 2])(
    'destroys %i constructed siblings when a later child factory fails',
    (failureIndex) => {
      const layout = new StrelitLayout();
      layouts.push(layout);
      const unbindComponent = vi.spyOn(layout, 'unbindComponent');
      layout.registerComponentFactoryFunction('working', () => undefined);
      layout.registerComponentFactoryFunction('failing', () => {
        throw new Error('later child factory failed');
      });
      const content = Array.from({ length: failureIndex + 1 }, (_, index) => ({
        type: 'component' as const,
        id: `child-${index}`,
        componentType: index === failureIndex ? 'failing' : 'working',
      }));

      expect(() =>
        layout.loadLayout({
          root: {
            type: 'row',
            content,
          },
        }),
      ).toThrow('later child factory failed');

      expect(unbindComponent).toHaveBeenCalledTimes(failureIndex);
      expect(layout.rootItem).toBeUndefined();
      expect(
        (
          layout as unknown as {
            _registeredComponentMap: Map<unknown, unknown>;
          }
        )._registeredComponentMap.size,
      ).toBe(0);
    },
  );

  it('restores the working root when direct component sizing fails', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadComponentAsRoot({
      type: 'component',
      id: 'working-root',
      componentType: 'panel',
    });
    const groundItem = layout.groundItem;
    const workingRoot = layout.rootItem;
    if (groundItem === undefined) {
      throw new Error('Expected a ground item');
    }
    vi.spyOn(groundItem, 'updateSize').mockImplementationOnce(() => {
      throw new Error('direct root sizing failed');
    });

    expect(() =>
      layout.loadComponentAsRoot({
        type: 'component',
        id: 'replacement-root',
        componentType: 'panel',
      }),
    ).toThrow('direct root sizing failed');

    expect(layout.rootItem).toBe(workingRoot);
    expect(
      (workingRoot as unknown as { _isDestroyed: boolean })._isDestroyed,
    ).toBe(false);
    expect(workingRoot?.element.isConnected).toBe(true);
    expect(
      layout.findFirstComponentItemById('replacement-root'),
    ).toBeUndefined();
  });

  it('closes incoming popouts when replacement root creation fails', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('working', () => undefined);
    layout.registerComponentFactoryFunction('failing', () => {
      throw new Error('component factory failed');
    });
    layout.loadLayout({
      root: {
        type: 'component',
        id: 'working-root',
        componentType: 'working',
      },
    });
    const workingRoot = layout.rootItem;
    const popupWindowClose = vi.fn();
    const popupWindow = {
      closed: false,
      close: popupWindowClose,
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
    const openWindow = vi
      .spyOn(globalThis, 'open')
      .mockReturnValue(popupWindow);

    expect(() =>
      layout.loadLayout({
        root: {
          type: 'component',
          componentType: 'failing',
        },
        openPopouts: [
          {
            root: {
              type: 'component',
              componentType: 'working',
            },
          },
        ],
      }),
    ).toThrow('component factory failed');
    expect(openWindow).toHaveBeenCalledOnce();
    expect(popupWindowClose).toHaveBeenCalledOnce();
    expect(layout.rootItem).toBe(workingRoot);
    expect(layout.openPopouts).toHaveLength(0);
  });

  it('rejects invalid dimensions without mutating the current size', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.setSize(640, 480);

    for (const [width, height] of [
      [Number.NaN, 480],
      [640, Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, 480],
      [-1, 480],
      [640, -1],
    ]) {
      expect(() => layout.setSize(width, height)).toThrow(RangeError);
      expect(layout.width).toBe(640);
      expect(layout.height).toBe(480);
    }
  });

  it('uses window scroll offsets when calculating item areas', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadComponentAsRoot({
      type: 'component',
      componentType: 'panel',
    });
    const root = layout.rootItem;
    if (root === undefined) {
      throw new Error('Expected a root item');
    }
    vi.spyOn(root.element, 'getBoundingClientRect').mockReturnValue({
      bottom: 60,
      height: 40,
      left: 10,
      right: 40,
      top: 20,
      width: 30,
      x: 10,
      y: 20,
      toJSON: () => undefined,
    });
    vi.spyOn(globalThis, 'scrollX', 'get').mockReturnValue(25);
    vi.spyOn(globalThis, 'scrollY', 'get').mockReturnValue(35);

    expect(root.getElementArea()).toMatchObject({
      x1: 35,
      y1: 55,
      x2: 65,
      y2: 95,
      surface: 1200,
    });
  });

  it('clears focus when a directly rooted component is destroyed', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadComponentAsRoot({
      type: 'component',
      id: 'focused-root',
      componentType: 'panel',
    });
    (layout.rootItem as ComponentItem | undefined)?.focus();

    layout.loadLayout({});

    expect(layout.focusedComponentItem).toBeUndefined();
  });

  it('cancels throttled state events when the layout is destroyed', () => {
    const scheduledCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
      (callback) => {
        scheduledCallbacks.push(callback);
        return 73 + scheduledCallbacks.length;
      },
    );
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', () => undefined);
    layout.loadComponentAsRoot({
      type: 'component',
      componentType: 'panel',
    });
    for (const callback of scheduledCallbacks.splice(0)) {
      callback(0);
    }
    const cancelAnimationFrame = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const stateChanged = vi.fn();
    layout.on('stateChanged', stateChanged);

    (layout.rootItem as ComponentItem | undefined)?.setTitle('updated');
    expect(scheduledCallbacks).toHaveLength(1);
    layout.destroy();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(74);
    scheduledCallbacks[0](0);
    expect(stateChanged).not.toHaveBeenCalled();
  });

  it('continues teardown after a destroy step fails and preserves the first error', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    const groundItem = layout.groundItem;
    if (groundItem === undefined) {
      throw new Error('Expected a ground item');
    }
    const firstError = new Error('ground teardown failed');
    vi.spyOn(groundItem, 'destroy').mockImplementationOnce(() => {
      throw firstError;
    });
    const internals = layout as unknown as {
      _resizeObserver: ResizeObserver;
      _eventHub: { destroy(): void };
      restoreBodyContainerStyles(): void;
    };
    const disconnect = vi.spyOn(internals._resizeObserver, 'disconnect');
    const destroyEventHub = vi.spyOn(internals._eventHub, 'destroy');
    const restoreStyles = vi.spyOn(internals, 'restoreBodyContainerStyles');

    expect(() => layout.destroy()).toThrow(firstError);

    expect(layout.isDestroyed).toBe(true);
    expect(layout.isInitialised).toBe(false);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(destroyEventHub).toHaveBeenCalledOnce();
    expect(restoreStyles).toHaveBeenCalledOnce();
  });

  it('attempts every open popout close when one close fails', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    let firstAttempts = 0;
    const firstPopout = {
      close: vi.fn(() => {
        if (++firstAttempts === 1) {
          throw new Error('first close failed');
        }
      }),
      getWindow: () => ({ closed: true }),
    };
    const secondPopout = {
      close: vi.fn(),
      getWindow: () => ({ closed: true }),
    };
    const internals = layout as unknown as {
      _openPopouts: {
        close(): void;
        getWindow(): { closed: boolean };
      }[];
    };
    internals._openPopouts.push(firstPopout, secondPopout);

    expect(() => layout.closeAllOpenPopouts()).toThrow('first close failed');

    expect(firstPopout.close).toHaveBeenCalledOnce();
    expect(secondPopout.close).toHaveBeenCalledOnce();
    expect(layout.openPopouts).toEqual([firstPopout]);

    expect(() => layout.closeAllOpenPopouts()).not.toThrow();

    expect(firstPopout.close).toHaveBeenCalledTimes(2);
    expect(layout.openPopouts).toHaveLength(0);
  });

  it('disposes failed popouts before clearing destruction ownership', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    const failedPopout = {
      close: vi.fn(() => {
        throw new Error('close failed during destroy');
      }),
      getWindow: () => ({ closed: false }),
      destroy: vi.fn(),
    };
    const internals = layout as unknown as {
      _openPopouts: {
        close(): void;
        getWindow(): { closed: boolean };
        destroy(): void;
      }[];
    };
    internals._openPopouts.push(failedPopout);

    expect(() => layout.destroy()).toThrow('close failed during destroy');
    expect(failedPopout.destroy).toHaveBeenCalledOnce();
    expect(layout.openPopouts).toHaveLength(0);
  });

  it('keeps unload-listener ownership after a failed removal for retry', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    const internals = layout as unknown as {
      _windowBeforeUnloadListening: boolean;
      _windowBeforeUnloadListener: EventListener;
    };
    internals._windowBeforeUnloadListening = true;
    const removeEventListener = vi
      .spyOn(globalThis, 'removeEventListener')
      .mockImplementationOnce(() => {
        throw new Error('listener removal failed');
      });

    expect(() => layout.closeAllOpenPopouts()).toThrow(
      'listener removal failed',
    );
    expect(internals._windowBeforeUnloadListening).toBe(true);

    removeEventListener.mockRestore();
    expect(() => layout.closeAllOpenPopouts()).not.toThrow();
    expect(internals._windowBeforeUnloadListening).toBe(false);
  });

  it('retries destroy cleanup after a persistent teardown failure', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    const removeEventListener = vi
      .spyOn(globalThis, 'removeEventListener')
      .mockImplementation(() => {
        throw new Error('listener removal failed during destroy');
      });
    const internals = layout as unknown as {
      _windowBeforeUnloadListening: boolean;
    };
    internals._windowBeforeUnloadListening = true;

    expect(() => layout.destroy()).toThrow(
      'listener removal failed during destroy',
    );
    expect(layout.isDestroyed).toBe(true);
    expect(internals._windowBeforeUnloadListening).toBe(true);

    removeEventListener.mockRestore();
    expect(() => layout.destroy()).not.toThrow();
    expect(internals._windowBeforeUnloadListening).toBe(false);
  });

  it('retains failed indicators and drag sources for destroy retry', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    const dropTargetIndicator = {
      destroy: vi.fn().mockImplementationOnce(() => {
        throw new Error('indicator teardown failed');
      }),
    };
    const transitionIndicator = { destroy: vi.fn() };
    const dragSource = {
      destroy: vi.fn().mockImplementationOnce(() => {
        throw new Error('drag source teardown failed');
      }),
    };
    const internals = layout as unknown as {
      _dropTargetIndicator: typeof dropTargetIndicator;
      _transitionIndicator: typeof transitionIndicator;
      _dragSources: (typeof dragSource)[];
    };
    internals._dropTargetIndicator = dropTargetIndicator;
    internals._transitionIndicator = transitionIndicator;
    internals._dragSources = [dragSource];

    expect(() => layout.destroy()).toThrow('indicator teardown failed');
    expect(internals._dropTargetIndicator).toBe(dropTargetIndicator);
    expect(internals._dragSources).toEqual([dragSource]);

    expect(() => layout.destroy()).not.toThrow();
    expect(dropTargetIndicator.destroy).toHaveBeenCalledTimes(2);
    expect(dragSource.destroy).toHaveBeenCalledTimes(2);
    expect(internals._dropTargetIndicator).toBeNull();
    expect(internals._dragSources).toHaveLength(0);
  });

  it('destroys partial layout state when initialization fails', () => {
    const layout = new SubwindowTestLayout(
      {
        root: { type: 'component', componentType: 'panel' },
      },
      true,
    );
    layouts.push(layout);

    expect(() => layout.init()).toThrow('component factory failed');
    expect(layout.isDestroyed).toBe(true);
    expect(layout.isInitialised).toBe(false);
    expect(layout.container.childElementCount).toBe(0);
  });

  it('preserves initialization failure when cleanup also fails', () => {
    const layout = new SubwindowTestLayout(
      { root: { type: 'component', componentType: 'panel' } },
      true,
    );
    const destroy = vi.spyOn(layout, 'destroy').mockImplementationOnce(() => {
      throw new Error('cleanup failed');
    });
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);

    try {
      expect(() => layout.init()).toThrow('component factory failed');
      expect(reportError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'cleanup failed' }),
      );
    } finally {
      destroy.mockRestore();
      vi.unstubAllGlobals();
      layout.destroy();
    }
  });

  it('preserves direct-root initialization failure when cleanup also fails', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('panel', (container) => {
      container.on('open', () => {
        throw new Error('root open failed');
      });
      container.on('beforeComponentRelease', () => {
        throw new Error('root cleanup failed');
      });
      return undefined;
    });
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);

    try {
      expect(() =>
        layout.loadComponentAsRoot({
          type: 'component',
          componentType: 'panel',
        }),
      ).toThrow('root open failed');
      expect(reportError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'root cleanup failed' }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('restores body and document inline styles on destroy', () => {
    const documentElement = document.documentElement;
    documentElement.style.cssText =
      'height: 42px; margin: 3px !important; padding: 4px; overflow: auto;';
    document.body.style.cssText =
      'height: 84px; margin: 5px; padding: 6px !important; overflow: scroll;';
    const documentStyle = documentElement.style.cssText;
    const bodyStyle = document.body.style.cssText;
    const layout = new StrelitLayout();
    layouts.push(layout);

    expect(documentElement.style.height).toBe('100%');
    expect(document.body.style.overflow).toBe('clip');
    layout.destroy();

    expect(documentElement.style.cssText).toBe(documentStyle);
    expect(document.body.style.cssText).toBe(bodyStyle);
  });

  it('restores shared body styles only after the last layout is destroyed', () => {
    const documentElement = document.documentElement;
    documentElement.style.cssText =
      'height: 42px; margin: 3px; padding: 4px; overflow: auto;';
    document.body.style.cssText =
      'height: 84px; margin: 5px; padding: 6px; overflow: scroll;';
    const documentStyle = documentElement.style.cssText;
    const bodyStyle = document.body.style.cssText;
    const first = new StrelitLayout();
    const second = new StrelitLayout();
    layouts.push(first, second);

    first.destroy();
    expect(documentElement.style.height).toBe('100%');
    expect(document.body.style.overflow).toBe('clip');

    second.destroy();
    expect(documentElement.style.cssText).toBe(documentStyle);
    expect(document.body.style.cssText).toBe(bodyStyle);
  });
});

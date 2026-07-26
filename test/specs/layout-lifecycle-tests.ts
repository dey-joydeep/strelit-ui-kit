import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ComponentContainer,
  type ComponentContainerBindableComponent,
  type ComponentContainerComponent,
  type LayoutConfig,
  LayoutManager,
  type ResolvedComponentItemConfig,
  StrelitLayout,
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
    expect(root?.isComponent).toBe(true);

    root?.focus();

    expect(layout.focusedComponentItem).toBe(root);
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

  it('does not create incoming popouts when replacement root creation fails', () => {
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
    const openWindow = vi.spyOn(globalThis, 'open');

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
    expect(openWindow).not.toHaveBeenCalled();
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
    layout.rootItem?.focus();

    layout.loadLayout({});

    expect(layout.focusedComponentItem).toBeUndefined();
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

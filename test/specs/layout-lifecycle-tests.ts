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

  constructor(config: LayoutConfig) {
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
});

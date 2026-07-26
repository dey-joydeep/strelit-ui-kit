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
  });
});

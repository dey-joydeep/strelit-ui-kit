import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ComponentContainer,
  ComponentItem,
  StrelitLayout,
  LayoutConfig,
  Stack,
} from '../../src';
import { TabsContainer } from '../../src/ts/controls/tabs-container';

describe('Tabs configuration and behavior', function () {
  let layout: StrelitLayout;

  beforeEach(function () {
    layout = new StrelitLayout();
    layout.registerComponentFactoryFunction(
      'testComponent',
      (container: ComponentContainer) => {
        const span = document.createElement('span');
        span.innerText = 'tab content';
        container.element.appendChild(span);
      },
    );
  });

  afterEach(function () {
    layout.destroy();
  });

  it('applies reorderEnabled setting to tabs', function () {
    const config: LayoutConfig = {
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            componentType: 'testComponent',
            reorderEnabled: true,
          },
          {
            type: 'component',
            componentType: 'testComponent',
            reorderEnabled: false,
          },
        ],
      },
    };

    layout.loadLayout(config);

    const stack = layout.rootItem as Stack;
    expect(stack).toBeDefined();
    expect(stack.header.tabs.length).toBe(2);

    expect(stack.header.tabs[0].reorderEnabled).toBe(true);
    expect(stack.header.tabs[1].reorderEnabled).toBe(false);
  });

  it('uses the layout reorder setting when a component omits an override', function () {
    const config: LayoutConfig = {
      settings: { reorderEnabled: false },
      root: {
        type: 'stack',
        content: [
          { type: 'component', componentType: 'testComponent' },
          {
            type: 'component',
            componentType: 'testComponent',
            reorderEnabled: true,
          },
        ],
      },
    };

    layout.loadLayout(config);

    const stack = layout.rootItem as Stack;
    expect(stack.header.tabs[0].reorderEnabled).toBe(false);
    expect(stack.header.tabs[1].reorderEnabled).toBe(true);
    expect(
      (
        layout.saveLayout().root?.content[0] as
          { reorderEnabled?: boolean } | undefined
      )?.reorderEnabled,
    ).toBe(false);
  });

  it('uses the layout reorder setting for components added at runtime', function () {
    layout.loadLayout({
      settings: { reorderEnabled: false },
      root: {
        type: 'stack',
        content: [{ type: 'component', componentType: 'testComponent' }],
      },
    });

    layout.addComponent('testComponent');

    const stack = layout.rootItem as Stack;
    expect(stack.header.tabs).toHaveLength(2);
    expect(stack.header.tabs[1].reorderEnabled).toBe(false);
    expect(
      (
        layout.saveLayout().root?.content[1] as
          { reorderEnabled?: boolean } | undefined
      )?.reorderEnabled,
    ).toBe(false);
  });

  it('applies the bottom header class when header.show is bottom', function () {
    const config: LayoutConfig = {
      root: {
        type: 'stack',
        header: {
          show: 'bottom',
        },
        content: [
          {
            type: 'component',
            componentType: 'testComponent',
          },
        ],
      },
    };

    layout.loadLayout(config);

    const stack = layout.rootItem as Stack;
    expect(stack.element.classList.contains('lm_bottom')).toBe(true);
  });

  it('assigns integer zIndex string (without px units) when tabOverlapAllowance is used', function () {
    const config: LayoutConfig = {
      settings: {
        tabOverlapAllowance: 50,
      },
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            componentType: 'testComponent',
            title: 'Tab 1',
          },
          {
            type: 'component',
            componentType: 'testComponent',
            title: 'Tab 2',
          },
        ],
      },
    };

    layout.loadLayout(config);
    const stack = layout.rootItem as Stack;
    const tabs = stack.header.tabs;
    expect(tabs.length).toBe(2);
    for (const tab of tabs) {
      const zIndex = tab.element.style.zIndex;
      if (zIndex && zIndex !== 'auto') {
        expect(zIndex).not.toContain('px');
        expect(Number.isInteger(Number(zIndex))).toBe(true);
      }
    }
  });

  it('moves a promoted overflow tab to the front of the DOM', function () {
    layout.loadLayout({
      root: {
        type: 'stack',
        content: ['First', 'Second', 'Third'].map((title) => ({
          type: 'component' as const,
          componentType: 'testComponent',
          title,
        })),
      },
    });

    const stack = layout.rootItem as Stack;
    const tabsContainer = (
      stack.header as unknown as {
        _tabsContainer: { _lastVisibleTabIndex: number };
      }
    )._tabsContainer;
    tabsContainer._lastVisibleTabIndex = 0;
    const thirdContentItem = stack.contentItems[2];
    if (thirdContentItem.type !== 'component') {
      throw new Error('Expected a component item');
    }
    const thirdComponent = thirdContentItem as ComponentItem;

    stack.setActiveComponentItem(thirdComponent, false);

    expect(stack.header.tabs[0].componentItem).toBe(thirdComponent);
    expect(stack.header.tabsContainerElement.firstElementChild).toBe(
      thirdComponent.tab.element,
    );
  });

  it('updates visible tab count when a visible tab leaves an overflowing stack', function () {
    const container = new TabsContainer(
      layout,
      () => {},
      () => {},
      () => {},
      () => {},
    );
    const internals = container as unknown as {
      _tabs: Array<{
        componentItem: ComponentItem;
        element: HTMLElement;
        destroy(): void;
      }>;
      _lastVisibleTabIndex: number;
    };
    const components = Array.from({ length: 3 }, () => ({}) as ComponentItem);
    for (const [index, componentItem] of components.entries()) {
      const element = document.createElement('div');
      if (index < 2) {
        container.element.appendChild(element);
      } else {
        container.dropdownElement.appendChild(element);
      }
      internals._tabs.push({
        componentItem,
        element,
        destroy: () => element.remove(),
      });
    }
    internals._lastVisibleTabIndex = 1;

    container.removeTab(components[1]);

    expect(container.element.children).toHaveLength(1);
    expect(container.lastVisibleTabIndex).toBe(0);
  });

  it('preserves the visible prefix when removing a hidden tab before a visible active overflow tab', function () {
    const container = new TabsContainer(
      layout,
      () => {},
      () => {},
      () => {},
      () => {},
    );
    const internals = container as unknown as {
      _tabs: Array<{
        componentItem: ComponentItem;
        element: HTMLElement;
        destroy(): void;
      }>;
      _lastVisibleTabIndex: number;
    };
    const components = Array.from({ length: 3 }, () => ({}) as ComponentItem);
    for (const [index, componentItem] of components.entries()) {
      const element = document.createElement('div');
      const parent =
        index === 1 ? container.dropdownElement : container.element;
      parent.appendChild(element);
      internals._tabs.push({
        componentItem,
        element,
        destroy: () => element.remove(),
      });
    }
    internals._lastVisibleTabIndex = 0;

    container.removeTab(components[1]);

    expect(container.element.children).toHaveLength(2);
    expect(container.lastVisibleTabIndex).toBe(0);
  });

  it('closes a closable tab on a middle-button auxclick', function () {
    layout.loadLayout({
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            id: 'middle-click-close',
            componentType: 'testComponent',
          },
        ],
      },
    });
    const stack = layout.rootItem as Stack;

    stack.header.tabs[0].element.dispatchEvent(
      new MouseEvent('auxclick', { bubbles: true, button: 1 }),
    );

    expect(
      layout.findFirstComponentItemById('middle-click-close'),
    ).toBeUndefined();
  });
});

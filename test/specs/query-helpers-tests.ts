import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ComponentContainer,
  ContentItem,
  StrelitLayout,
  ItemType,
  LayoutConfig,
} from '../../src';

describe('query helpers', function () {
  let layout: StrelitLayout;

  beforeAll(function () {
    layout = new StrelitLayout();

    function Recorder(container: ComponentContainer) {
      const span = document.createElement('span');
      span.innerText = 'query helper component';
      container.element.appendChild(span);
      return;
    }

    layout.registerComponentFactoryFunction('testComponent', Recorder);
    layout.registerComponentFactoryFunction('otherComponent', Recorder);
  });

  afterAll(function () {
    layout.destroy();
  });

  beforeEach(function () {
    const config: LayoutConfig = {
      root: {
        type: 'row',
        id: 'row-1',
        content: [
          {
            type: 'stack',
            id: 'stack-1',
            content: [
              {
                type: 'component',
                id: 'component-1',
                componentType: 'testComponent',
              },
              {
                type: 'component',
                id: 'component-2',
                componentType: 'otherComponent',
              },
            ],
          },
          {
            type: 'column',
            id: 'column-1',
            content: [
              {
                type: 'stack',
                id: 'stack-2',
                content: [
                  {
                    type: 'component',
                    id: 'component-3',
                    componentType: 'testComponent',
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    layout.loadLayout(config);
  });

  it('returns items by id and type from the layout manager', function () {
    expect(layout.getItemsById('stack-1').length).toBe(1);
    expect(layout.getItemsById('missing').length).toBe(0);

    expect(layout.getItemsByType(ItemType.row).length).toBe(1);
    expect(layout.getItemsByType(ItemType.column).length).toBe(1);
    expect(layout.getItemsByType(ItemType.stack).length).toBe(2);
    expect(layout.getItemsByType(ItemType.component).length).toBe(3);
  });

  it('returns component items by component type from the layout manager', function () {
    const testComponents = layout.getComponentItemsByType('testComponent');
    expect(testComponents.length).toBe(2);
    expect(
      testComponents.every((item) => item.componentType === 'testComponent'),
    ).toBe(true);

    const otherComponents = layout.getComponentsByName('otherComponent');
    expect(otherComponents.length).toBe(1);
    expect(otherComponents[0].id).toBe('component-2');
  });

  it('returns items recursively from the root content item', function () {
    const rootItem = layout.rootItem;
    expect(rootItem).toBeDefined();
    const rootContentItem = rootItem as ContentItem;

    expect(rootContentItem.getItemsByType(ItemType.component).length).toBe(3);
    expect(rootContentItem.getItemsById('column-1').length).toBe(1);
    expect(
      rootContentItem.getComponentItemsByType('testComponent').length,
    ).toBe(2);
  });

  it('finds the first component item by id', function () {
    const componentItem = layout.findFirstComponentItemById('component-3');
    expect(componentItem).toBeDefined();
    const componentType =
      componentItem === undefined ? undefined : componentItem.componentType;
    expect(componentType).toBe('testComponent');
  });

  it('matches structured component types using deep equality', function () {
    const structuredType = { family: 'chart', variant: 'ohlc' };
    const structuredLayout = new StrelitLayout(
      undefined,
      (container) => {
        const span = document.createElement('span');
        span.innerText = 'structured type';
        container.element.appendChild(span);
        return {
          component: { rootHtmlElement: span },
          virtual: false,
        };
      },
      () => {},
    );

    try {
      const config: LayoutConfig = {
        root: {
          type: 'stack',
          content: [
            {
              type: 'component',
              id: 'structured-component',
              componentType: structuredType,
            },
          ],
        },
      };

      structuredLayout.loadLayout(config);

      const matches = structuredLayout.getComponentItemsByType({
        family: 'chart',
        variant: 'ohlc',
      });
      expect(matches.length).toBe(1);
      expect(matches[0].id).toBe('structured-component');
    } finally {
      structuredLayout.destroy();
    }
  });

  it('allows for query chaining on subtree items', function () {
    const column = layout.rootItem!.getItemsById('column-1')[0];
    expect(column).toBeDefined();

    const innerStacks = column.getItemsByType('stack');
    expect(innerStacks.length).toBe(1);
    expect(innerStacks[0].id).toBe('stack-2');

    const innerComponents = column.getItemsById('component-3');
    expect(innerComponents.length).toBe(1);
    expect(innerComponents[0].id).toBe('component-3');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComponentContainer,
  StrelitLayout,
  LayoutConfig,
  LayoutManagerLocationSelectorTypeId,
  RowOrColumn,
  Stack,
  Tab,
} from '../../src';

describe('Runtime layout tree manipulation', function () {
  let layout: StrelitLayout;

  beforeEach(function () {
    layout = new StrelitLayout();
    layout.registerComponentFactoryFunction(
      'testComponent',
      (container: ComponentContainer) => {
        const span = document.createElement('span');
        span.innerText = 'component';
        container.element.appendChild(span);
      },
    );
  });

  afterEach(function () {
    layout.destroy();
  });

  it('adds, replaces, and removes children at runtime', function () {
    const config: LayoutConfig = {
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            componentType: 'testComponent',
          },
        ],
      },
    };

    layout.loadLayout(config);

    expect(layout.rootItem).toBeDefined();
    const stack = layout.rootItem!;
    expect(stack.isStack).toBe(true);
    expect(stack.contentItems.length).toBe(1);

    layout.newComponent('testComponent', undefined, 'Added Component');
    expect(stack.contentItems.length).toBe(2);
  });

  it('forwards destroyOldChild flag when replacing or collapsing nested row/column wrappers', function () {
    const config: LayoutConfig = {
      root: {
        type: 'row',
        content: [
          {
            type: 'column',
            content: [
              {
                type: 'component',
                componentType: 'testComponent',
              },
            ],
          },
        ],
      },
    };

    layout.loadLayout(config);
    const rootRow = layout.rootItem as RowOrColumn;
    const nestedColumn = rootRow.contentItems[0] as RowOrColumn;
    const itemDestroyed = vi.fn();
    nestedColumn.on('itemDestroyed', itemDestroyed);

    nestedColumn.checkCollapse();

    expect(itemDestroyed).toHaveBeenCalledTimes(1);
  });

  it('skips existing stacks when adding a non-component item config via addItem', function () {
    const config: LayoutConfig = {
      root: {
        type: 'row',
        content: [
          {
            type: 'stack',
            content: [
              {
                type: 'component',
                componentType: 'testComponent',
              },
            ],
          },
        ],
      },
    };

    layout.loadLayout(config);

    expect(() => {
      layout.addItem({
        type: 'row',
        content: [
          {
            type: 'component',
            componentType: 'testComponent',
          },
        ],
      });
    }).not.toThrow();
  });

  it('wraps a stack root when adding a structural item via default placement', function () {
    layout.loadLayout({
      root: {
        type: 'stack',
        content: [{ type: 'component', componentType: 'testComponent' }],
      },
    });

    expect(() =>
      layout.addItem({
        type: 'column',
        content: [{ type: 'component', componentType: 'testComponent' }],
      }),
    ).not.toThrow();

    expect(layout.rootItem?.type).toBe('row');
    expect(layout.rootItem?.contentItems.map((item) => item.type)).toEqual([
      'stack',
      'column',
    ]);
  });

  it('keeps an incompatible root unchanged when structural item creation fails', function () {
    layout.registerComponentFactoryFunction('failingComponent', () => {
      throw new Error('factory failed');
    });
    layout.loadLayout({
      root: {
        type: 'stack',
        content: [{ type: 'component', componentType: 'testComponent' }],
      },
    });
    const originalRoot = layout.rootItem as Stack;

    expect(() =>
      layout.addItem({
        type: 'row',
        content: [{ type: 'component', componentType: 'failingComponent' }],
      }),
    ).toThrow('factory failed');

    expect(layout.rootItem).toBe(originalRoot);
    expect(originalRoot.contentItems).toHaveLength(1);
    expect(originalRoot.header.tabs).toHaveLength(1);
  });

  it('restores an incompatible root without re-entering failed GroundItem sizing', function () {
    layout.loadLayout({
      root: {
        type: 'stack',
        content: [{ type: 'component', componentType: 'testComponent' }],
      },
    });
    const originalRoot = layout.rootItem;
    vi.spyOn(layout.groundItem!, 'addChild').mockImplementation(() => {
      throw new Error('persistent ground insertion failure');
    });

    expect(() =>
      layout.addItem({
        type: 'column',
        content: [{ type: 'component', componentType: 'testComponent' }],
      }),
    ).toThrow('persistent ground insertion failure');

    expect(layout.rootItem).toBe(originalRoot);
    expect(originalRoot?.element.isConnected).toBe(true);
  });

  it.each([
    [0, ['column', 'stack']],
    [1, ['stack', 'column']],
  ] as const)(
    'honors explicit structural root placement index %i',
    (index, expectedTypes) => {
      layout.loadLayout({
        root: {
          type: 'stack',
          content: [{ type: 'component', componentType: 'testComponent' }],
        },
      });

      const location = layout.addItemAtLocation(
        {
          type: 'column',
          content: [{ type: 'component', componentType: 'testComponent' }],
        },
        [{ typeId: LayoutManagerLocationSelectorTypeId.Root, index }],
      );

      expect(location?.index).toBe(index);
      expect(layout.rootItem?.contentItems.map((item) => item.type)).toEqual(
        expectedTypes,
      );
    },
  );

  it('rejects an invalid structural root placement boundary without mutation', function () {
    layout.loadLayout({
      root: {
        type: 'stack',
        content: [{ type: 'component', componentType: 'testComponent' }],
      },
    });
    const originalRoot = layout.rootItem;

    const location = layout.addItemAtLocation(
      {
        type: 'column',
        content: [{ type: 'component', componentType: 'testComponent' }],
      },
      [{ typeId: LayoutManagerLocationSelectorTypeId.Root, index: 2 }],
    );

    expect(location).toBeUndefined();
    expect(layout.rootItem).toBe(originalRoot);
  });

  it('wraps a direct component root before adding structural content', function () {
    layout.loadComponentAsRoot({
      type: 'component',
      componentType: 'testComponent',
    });

    expect(() =>
      layout.addItem({
        type: 'column',
        content: [{ type: 'component', componentType: 'testComponent' }],
      }),
    ).not.toThrow();

    expect(layout.rootItem?.contentItems.map((item) => item.type)).toEqual([
      'component',
      'column',
    ]);
  });

  it('commits the complete stack insertion before notifying tabCreated listeners', function () {
    layout.loadLayout({
      root: {
        type: 'stack',
        content: [{ type: 'component', componentType: 'testComponent' }],
      },
    });
    const stack = layout.rootItem as Stack;
    let notifiedTab: Tab | undefined;
    layout.on('tabCreated', (tab) => {
      notifiedTab = tab;
      throw new Error('listener failed');
    });

    expect(() =>
      stack.addItem({ type: 'component', componentType: 'testComponent' }),
    ).toThrow('listener failed');

    expect(stack.contentItems).toHaveLength(2);
    expect(stack.header.tabs).toHaveLength(2);
    const createdTab = stack.contentItems[1].tab;
    expect(stack.header.tabs).toContain(createdTab);
    expect(notifiedTab).toBe(createdTab);
    expect(createdTab.element.isConnected).toBe(true);
    expect(createdTab.isActive).toBe(true);
    expect(stack.getActiveComponentItem()).toBe(stack.contentItems[1]);
    expect(stack.contentItems[1].element.style.display).not.toBe('none');
  });

  it('initializes the complete stack before notifying tabCreated listeners', function () {
    const observed: Array<{
      tab: Tab;
      itemInitialised: boolean;
      headerContainsTab: boolean;
    }> = [];
    layout.on('tabCreated', (tab) => {
      const stack = tab.componentItem.parent as Stack;
      observed.push({
        tab,
        itemInitialised: tab.componentItem.isInitialised,
        headerContainsTab: stack.header.tabs.includes(tab),
      });
    });

    layout.loadLayout({
      root: {
        type: 'stack',
        content: [{ type: 'component', componentType: 'testComponent' }],
      },
    });

    expect(observed).toHaveLength(1);
    expect(observed[0].tab.componentItem.isInitialised).toBe(true);
    expect(observed[0].itemInitialised).toBe(true);
    expect(observed[0].headerContainsTab).toBe(true);
  });

  it('destroys later siblings and its own element after a child destroy failure', function () {
    layout.loadLayout({
      root: {
        type: 'row',
        content: [
          { type: 'component', componentType: 'testComponent' },
          { type: 'component', componentType: 'testComponent' },
        ],
      },
    });
    const root = layout.rootItem as RowOrColumn;
    const firstDestroy = vi
      .spyOn(root.contentItems[0], 'destroy')
      .mockImplementationOnce(() => {
        throw new Error('first destroy failed');
      });
    const secondDestroy = vi.spyOn(root.contentItems[1], 'destroy');

    expect(() => root.destroy()).toThrow('first destroy failed');

    expect(firstDestroy).toHaveBeenCalledOnce();
    expect(secondDestroy).toHaveBeenCalledOnce();
    expect(root.contentItems).toHaveLength(1);
    expect(root.element.isConnected).toBe(false);

    expect(() => root.destroy()).not.toThrow();
    expect(firstDestroy).toHaveBeenCalledTimes(2);
    expect(root.contentItems).toHaveLength(0);
  });

  it.each([-1, 0.5, 3, Number.NaN])(
    'rejects invalid row insertion index %s without mutation',
    (index) => {
      layout.loadLayout({
        root: {
          type: 'row',
          content: [
            { type: 'component', componentType: 'testComponent' },
            { type: 'component', componentType: 'testComponent' },
          ],
        },
      });
      const row = layout.rootItem as RowOrColumn;
      const children = [...row.contentItems];
      const childElementCount = row.element.childElementCount;

      expect(() =>
        row.newItem(
          { type: 'component', componentType: 'testComponent' },
          index,
        ),
      ).toThrow(RangeError);
      expect(row.contentItems).toEqual(children);
      expect(row.element.childElementCount).toBe(childElementCount);
    },
  );

  it.each([-1, 0.5, 2, Number.NaN])(
    'rejects invalid stack insertion index %s before binding',
    (index) => {
      const countedFactory = vi.fn(() => undefined);
      layout.registerComponentFactoryFunction('counted', countedFactory);
      layout.loadLayout({
        root: {
          type: 'stack',
          content: [{ type: 'component', componentType: 'testComponent' }],
        },
      });
      const stack = layout.rootItem as Stack;
      const children = [...stack.contentItems];

      expect(() =>
        stack.addItem({ type: 'component', componentType: 'counted' }, index),
      ).toThrow();
      expect(countedFactory).not.toHaveBeenCalled();
      expect(stack.contentItems).toEqual(children);
    },
  );

  it.each([-1, 0.5, 2, Number.NaN])(
    'rejects direct stack child insertion index %s without mutation',
    (index) => {
      layout.loadLayout({
        root: {
          type: 'stack',
          content: [{ type: 'component', componentType: 'testComponent' }],
        },
      });
      const stack = layout.rootItem as Stack;
      const child = layout.createAndInitContentItem(
        {
          ...stack.contentItems[0].toConfig(),
          id: `detached-${index}`,
        },
        stack,
      );
      const children = [...stack.contentItems];
      const tabCount = stack.header.tabs.length;

      try {
        expect(() => stack.addChild(child, index)).toThrow();
        expect(stack.contentItems).toEqual(children);
        expect(stack.header.tabs).toHaveLength(tabCount);
      } finally {
        child.destroy();
      }
    },
  );

  it('clears maximisedStack when the maximised stack is destroyed', function () {
    const config: LayoutConfig = {
      root: {
        type: 'stack',
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
    stack.maximise();
    expect(layout.maximisedStack).toBe(stack);

    stack.remove();
    expect(layout.maximisedStack).toBeUndefined();
  });

  it('does not throw when dropping a row/column onto a stack', function () {
    const config: LayoutConfig = {
      root: {
        type: 'row',
        content: [
          {
            type: 'stack',
            id: 'targetStack',
            content: [
              {
                type: 'component',
                componentType: 'testComponent',
                id: 'comp1',
              },
            ],
          },
          {
            type: 'column',
            id: 'droppedColumn',
            content: [
              {
                type: 'component',
                componentType: 'testComponent',
                id: 'comp2',
              },
            ],
          },
        ],
      },
    };

    layout.loadLayout(config);
    const targetStack = layout.findFirstComponentItemById('comp1')
      ?.parent as Stack;
    const droppedColumn = (layout.rootItem as RowOrColumn).contentItems[1];
    const stackInternals = targetStack as unknown as {
      _dropSegment: string;
      _dropIndex: number;
    };
    stackInternals._dropSegment = 'header';
    stackInternals._dropIndex = 1;

    expect(() => {
      targetStack.onDrop(droppedColumn, {
        side: 'top',
        contentItem: targetStack,
        x1: 0,
        x2: 100,
        y1: 0,
        y2: 100,
      } as any);
    }).not.toThrow();

    expect(targetStack.contentItems.map((item) => item.id)).toEqual([
      'comp1',
      'comp2',
    ]);
    const savedRoot = layout.saveLayout().root;
    expect(savedRoot?.type).toBe('stack');
    expect(savedRoot?.content?.map((item) => item.id)).toEqual([
      'comp1',
      'comp2',
    ]);
  });
});

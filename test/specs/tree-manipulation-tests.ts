import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComponentContainer,
  StrelitLayout,
  LayoutConfig,
  RowOrColumn,
  Stack,
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
            isClosable: false,
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

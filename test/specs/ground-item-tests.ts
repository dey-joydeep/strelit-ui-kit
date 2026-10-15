import { afterAll, describe, expect, it } from 'vitest';
import {
  StrelitLayout,
  LayoutConfig,
  resolveStackItemConfig,
  type ContentItem,
  type ComponentItemConfig,
  type StackItemConfig,
} from '../../src';
import type {
  GroundItem,
  GroundItemArea,
} from '../../src/ts/items/ground-item';
import TestTools from './test-tools';

describe('ground item', function () {
  let layout: StrelitLayout;

  afterAll(function () {
    layout?.destroy();
  });

  it('component gets wrapped in a stack', function () {
    const rootLayout: LayoutConfig = {
      root: {
        type: 'component',
        componentType: TestTools.TEST_COMPONENT_NAME,
      },
    };

    layout = TestTools.createLayout(rootLayout);

    const layoutElements = document.querySelectorAll('.lm_strelit');
    expect(layoutElements.length).toBe(1);
    TestTools.verifyPath('stack.0.component', layout);
  });

  it('only enables automatic container resizing for the body by default', function () {
    const customContainer = document.createElement('div');
    document.body.appendChild(customContainer);

    const customLayout = new StrelitLayout(customContainer);
    expect(customLayout.resizeWithContainerAutomatically).toBe(false);
    customLayout.destroy();
    customContainer.remove();

    const bodyLayout = new StrelitLayout();
    expect(bodyLayout.resizeWithContainerAutomatically).toBe(true);
    bodyLayout.destroy();
  });

  it('accepts a side drop into an empty root row', function () {
    const emptyLayout = TestTools.createLayout({
      root: { type: 'row', content: [] },
    });
    const ground = emptyLayout.groundItem as GroundItem;
    const stack = emptyLayout.createAndInitContentItem(
      resolveStackItemConfig({
        type: 'stack',
        content: [
          {
            type: 'component',
            componentType: TestTools.TEST_COMPONENT_NAME,
          } satisfies ComponentItemConfig,
        ],
      } satisfies StackItemConfig),
      ground,
    );

    expect(() =>
      ground.onDrop(stack, {
        side: 'x2',
        contentItem: ground as unknown as ContentItem,
        x1: 0,
        x2: 100,
        y1: 0,
        y2: 100,
        surface: 10_000,
      }),
    ).not.toThrow();
    expect(emptyLayout.rootItem?.contentItems).toEqual([stack]);
    expect(stack.size).toBe(100);
    emptyLayout.destroy();
  });

  it.each(['x1', 'x2', 'y1', 'y2'] as const)(
    'creates the correct orientation and order for a %s ground drop',
    function (side) {
      const dropLayout = TestTools.createLayout({
        root: {
          type: 'component',
          componentType: TestTools.TEST_COMPONENT_NAME,
        },
      });
      try {
        const ground = dropLayout.groundItem as GroundItem;
        const original = dropLayout.rootItem as ContentItem;
        const dropped = dropLayout.createAndInitContentItem(
          resolveStackItemConfig({ type: 'stack', content: [] }),
          ground,
        );
        ground.onDrop(dropped, {
          side,
          contentItem: ground as unknown as ContentItem,
          x1: 0,
          x2: 100,
          y1: 0,
          y2: 100,
          surface: 10_000,
        } as GroundItemArea);

        const root = dropLayout.rootItem as ContentItem;
        expect(root.type).toBe(side[0] === 'x' ? 'row' : 'column');
        expect(root.contentItems).toEqual(
          side[1] === '2' ? [dropped, original] : [original, dropped],
        );
        expect(original.size).toBe(50);
        expect(dropped.size).toBe(50);
        expect(dropped.parent).toBe(root);
        expect(original.parent).toBe(root);
      } finally {
        dropLayout.destroy();
      }
    },
  );

  it.each(['x1', 'x2'] as const)(
    'splits the edge sibling in an existing row for a %s ground drop',
    function (side) {
      const dropLayout = TestTools.createLayout({
        root: {
          type: 'row',
          content: [
            { type: 'component', componentType: TestTools.TEST_COMPONENT_NAME },
            { type: 'component', componentType: TestTools.TEST_COMPONENT_NAME },
          ],
        },
      });
      try {
        const ground = dropLayout.groundItem as GroundItem;
        const root = dropLayout.rootItem as ContentItem;
        const originalChildren = [...root.contentItems];
        const edge = side === 'x2' ? originalChildren[0] : originalChildren[1];
        const priorSize = edge.size;
        const dropped = dropLayout.createAndInitContentItem(
          resolveStackItemConfig({ type: 'stack', content: [] }),
          ground,
        );
        ground.onDrop(dropped, {
          side,
          contentItem: ground as unknown as ContentItem,
          x1: 0,
          x2: 100,
          y1: 0,
          y2: 100,
          surface: 10_000,
        } as GroundItemArea);

        expect(dropLayout.rootItem).toBe(root);
        expect(root.contentItems).toEqual(
          side === 'x2'
            ? [dropped, ...originalChildren]
            : [...originalChildren, dropped],
        );
        expect(edge.size).toBeCloseTo(priorSize / 2);
        expect(dropped.size).toBeCloseTo(priorSize / 2);
        expect(dropped.parent).toBe(root);
      } finally {
        dropLayout.destroy();
      }
    },
  );
});

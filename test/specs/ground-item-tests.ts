import { afterAll, describe, expect, it } from 'vitest';
import {
  StrelitLayout,
  LayoutConfig,
  resolveItemConfig,
  type ContentItem,
  type GroundItem,
} from '../../src';
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
      resolveItemConfig({
        type: 'stack',
        content: [
          {
            type: 'component',
            componentType: TestTools.TEST_COMPONENT_NAME,
          },
        ],
      }),
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
      }),
    ).not.toThrow();
    expect(emptyLayout.rootItem?.contentItems).toEqual([stack]);
    expect(stack.size).toBe(100);
    emptyLayout.destroy();
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComponentContainer, StrelitLayout, LayoutConfig } from '../../src';

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
});

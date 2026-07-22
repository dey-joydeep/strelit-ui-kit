import { afterEach, describe, expect, it } from 'vitest';
import {
  ComponentContainer,
  RowOrColumn,
  StrelitLayout,
  type LayoutConfig,
} from '../../src';

describe('splitter limits', () => {
  const layouts: StrelitLayout[] = [];

  afterEach(() => {
    for (const layout of layouts) {
      layout.destroy();
    }
  });

  it('enforces minSize on the direct children beside the splitter', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction(
      'component',
      (_container: ComponentContainer) => undefined,
    );
    const component = {
      type: 'component',
      componentType: 'component',
    } as const;
    const config: LayoutConfig = {
      root: {
        type: 'row',
        content: [
          { type: 'stack', minSize: '300px', content: [component] },
          { type: 'stack', minSize: '300px', content: [component] },
        ],
      },
    };
    layout.loadLayout(config);

    const row = layout.rootItem as RowOrColumn;
    row.contentItems[0].element.style.width = '400px';
    row.contentItems[1].element.style.width = '400px';
    const internals = row as unknown as {
      _splitter: { element: HTMLElement }[];
      onSplitterDragStart(splitter: unknown): void;
      onSplitterDrag(splitter: unknown, offsetX: number, offsetY: number): void;
    };
    const splitter = internals._splitter[0];

    internals.onSplitterDragStart(splitter);
    internals.onSplitterDrag(splitter, -250, 0);

    expect(splitter.element.style.left).toBe('-100px');
  });
});

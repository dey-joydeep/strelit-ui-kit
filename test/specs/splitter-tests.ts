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

  it('keeps relative sizes finite when both splitter sides have zero pixels', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('component', () => undefined);
    layout.loadLayout({
      root: {
        type: 'row',
        content: [
          { type: 'component', componentType: 'component' },
          { type: 'component', componentType: 'component' },
        ],
      },
    });
    const row = layout.rootItem as RowOrColumn;
    for (const item of row.contentItems) {
      item.element.style.width = '0px';
    }
    const internals = row as unknown as {
      _splitter: unknown[];
      _splitterPosition: number;
      onSplitterDragStop(splitter: unknown): void;
    };
    internals._splitterPosition = 0;

    internals.onSplitterDragStop(internals._splitter[0]);

    expect(row.contentItems.map((item) => item.size)).toEqual([50, 50]);
  });

  it('normalizes fractional children when percent children already total 100', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('component', () => undefined);

    expect(() =>
      layout.loadLayout({
        root: {
          type: 'row',
          content: [
            {
              type: 'component',
              componentType: 'component',
              size: '100%',
            },
            {
              type: 'component',
              componentType: 'component',
              size: '1fr',
            },
          ],
        },
      }),
    ).not.toThrow();

    const row = layout.rootItem as RowOrColumn;
    expect(row.contentItems.every((item) => item.sizeUnit === '%')).toBe(true);
    expect(
      row.contentItems.reduce((total, item) => total + item.size, 0),
    ).toBeCloseTo(100);
  });
});

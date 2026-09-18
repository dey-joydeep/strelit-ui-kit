import { describe, expect, it } from 'vitest';
import { ComponentContainer, ComponentItem, StrelitLayout } from '../../src';

describe('ComponentContainer sizing', () => {
  it('does not corrupt sibling sizes when the current dimension is zero', () => {
    const layout = new StrelitLayout();
    try {
      layout.registerComponentFactoryFunction(
        'panel',
        (_container: ComponentContainer) => undefined,
      );
      layout.loadLayout({
        root: {
          type: 'row',
          content: [
            {
              type: 'component',
              id: 'zero-size',
              componentType: 'panel',
              size: '0%',
            },
            {
              type: 'component',
              componentType: 'panel',
              size: '100%',
            },
          ],
        },
      });
      const item = layout.findFirstComponentItemById(
        'zero-size',
      ) as ComponentItem;
      const row = item.parentItem.parent;
      expect(row?.isRow).toBe(true);
      const originalSizes = row?.contentItems.map(
        (contentItem) => contentItem.size,
      );
      (
        item.container as unknown as {
          _width: number;
        }
      )._width = 0;

      expect(item.container.setSize(100, 100)).toBe(false);
      expect(row?.contentItems.map((contentItem) => contentItem.size)).toEqual(
        originalSizes,
      );
      expect(
        row?.contentItems.every((contentItem) =>
          Number.isFinite(contentItem.size),
        ),
      ).toBe(true);
    } finally {
      layout.destroy();
    }
  });

  it('takes growth only from sibling space above minimum sizes', () => {
    const layout = new StrelitLayout();
    try {
      layout.registerComponentFactoryFunction(
        'panel',
        (_container: ComponentContainer) => undefined,
      );
      layout.loadLayout({
        dimensions: { defaultMinItemWidth: '10px' },
        root: {
          type: 'row',
          content: [
            {
              type: 'component',
              id: 'target',
              componentType: 'panel',
              size: '10%',
            },
            {
              type: 'component',
              componentType: 'panel',
              size: '1%',
            },
            {
              type: 'component',
              componentType: 'panel',
              size: '89%',
            },
          ],
        },
      });
      const item = layout.findFirstComponentItemById('target') as ComponentItem;
      const row = item.parentItem.parent;
      expect(row?.isRow).toBe(true);
      (
        item.container as unknown as {
          _width: number;
        }
      )._width = 96;
      const previousTotal =
        row?.contentItems.reduce(
          (total, contentItem) => total + contentItem.size,
          0,
        ) ?? 0;

      expect(item.container.setSize(192, 100)).toBe(true);
      const sizes =
        row?.contentItems.map((contentItem) => contentItem.size) ?? [];
      expect(sizes.every((size) => Number.isFinite(size) && size >= 0)).toBe(
        true,
      );
      expect(sizes.reduce((total, size) => total + size, 0)).toBeCloseTo(
        previousTotal,
      );
      expect(sizes[1]).toBeGreaterThan(0);
    } finally {
      layout.destroy();
    }
  });

  it.each([
    { direction: 'row' as const, header: 'left' as const },
    { direction: 'row' as const, header: 'right' as const },
    { direction: 'column' as const, header: 'top' as const },
    { direction: 'column' as const, header: 'bottom' as const },
  ])(
    'includes a $header header when resizing content in a $direction',
    ({ direction, header }) => {
      const layout = new StrelitLayout();
      try {
        layout.registerComponentFactoryFunction('panel', () => undefined);
        layout.loadLayout({
          root: {
            type: direction,
            content: [
              {
                type: 'stack',
                size: '50%',
                header: { show: header },
                content: [
                  {
                    type: 'component',
                    id: 'target',
                    componentType: 'panel',
                  },
                ],
              },
              {
                type: 'stack',
                size: '50%',
                content: [{ type: 'component', componentType: 'panel' }],
              },
            ],
          },
        });
        const item = layout.findFirstComponentItemById(
          'target',
        ) as ComponentItem;
        const stack = item.parentItem;
        const rowOrColumn = stack.parent;
        const containerInternals = item.container as unknown as {
          _width: number;
          _height: number;
        };
        containerInternals._width = 90;
        containerInternals._height = 90;
        Object.defineProperty(
          stack.element,
          direction === 'row' ? 'offsetWidth' : 'offsetHeight',
          { configurable: true, value: 100 },
        );

        expect(item.container.setSize(140, 140)).toBe(true);
        expect(rowOrColumn?.contentItems[0].size).toBeCloseTo(75);
        expect(rowOrColumn?.contentItems[1].size).toBeCloseTo(25);
      } finally {
        layout.destroy();
      }
    },
  );
});

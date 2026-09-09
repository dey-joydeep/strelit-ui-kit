import { afterEach, describe, expect, it } from 'vitest';
import { ComponentContainer, ItemType, StrelitLayout } from '../../src';

describe('responsive layout', () => {
  const layouts: StrelitLayout[] = [];

  afterEach(() => {
    for (const layout of layouts) {
      layout.destroy();
    }
  });

  it('removes emptied columns after moving their components', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction(
      'component',
      (_container: ComponentContainer) => undefined,
    );
    layout.loadLayout({
      settings: { responsiveMode: 'always' },
      dimensions: { defaultMinItemWidth: '300px' },
      root: {
        type: 'row',
        content: [
          { type: 'component', id: 'one', componentType: 'component' },
          { type: 'component', id: 'two', componentType: 'component' },
          { type: 'component', id: 'three', componentType: 'component' },
        ],
      },
    });

    layout.setSize(300, 300);

    expect(layout.getItemsByType(ItemType.column)).toEqual([]);
    expect(layout.getComponentItemsByType('component')).toHaveLength(3);
  });

  it('retains the branch that owns the responsive destination stack', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    layout.registerComponentFactoryFunction('component', () => undefined);
    layout.setSize(300, 300);

    expect(() =>
      layout.loadLayout({
        settings: { responsiveMode: 'always' },
        dimensions: { defaultMinItemWidth: '300px' },
        root: {
          type: 'row',
          content: [
            { type: 'row', content: [] },
            {
              type: 'component',
              id: 'retained',
              componentType: 'component',
            },
          ],
        },
      }),
    ).not.toThrow();

    expect(layout.getComponentItemsByType('component')).toHaveLength(1);
    expect(layout.findFirstComponentItemById('retained')).toBeDefined();
    expect(layout.rootItem?.getItemsByType('stack')).toHaveLength(1);
  });
});

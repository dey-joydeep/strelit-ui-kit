import { afterEach, describe, expect, it } from 'vitest';
import { ComponentContainer, StrelitLayout } from '../../src';

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

    expect(layout.getAllContentItems().filter((item) => item.isColumn)).toEqual(
      [],
    );
    expect(layout.getComponentItemsByType('component')).toHaveLength(3);
  });
});

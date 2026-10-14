import { describe, expect, it } from 'vitest';
import { StrelitLayout } from '../../src';

describe('structured component type queries', () => {
  it('matches nested arrays and objects by value and rejects changed members', () => {
    const layout = new StrelitLayout(
      undefined,
      (container) => ({
        component: { rootHtmlElement: container.element },
        virtual: false,
      }),
      () => {},
    );
    try {
      layout.loadLayout({
        root: {
          type: 'component',
          componentType: { family: 'chart', options: ['ohlc', { scale: 2 }] },
        },
      });

      expect(
        layout.getComponentItemsByType({
          options: ['ohlc', { scale: 2 }],
          family: 'chart',
        }),
      ).toHaveLength(1);
      expect(
        layout.getComponentItemsByType({
          family: 'chart',
          options: ['ohlc', { scale: 3 }],
        }),
      ).toHaveLength(0);
    } finally {
      layout.destroy();
    }
  });
});

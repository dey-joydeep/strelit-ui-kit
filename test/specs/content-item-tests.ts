import { describe, expect, it, vi } from 'vitest';
import { RowOrColumn, StrelitLayout } from '../../src';

describe('content item replacement', () => {
  it('restores the old DOM and tree when destroying the replaced item fails', () => {
    const layout = new StrelitLayout();
    layout.registerComponentFactoryFunction('panel', () => undefined);
    try {
      layout.loadLayout({
        root: {
          type: 'row',
          content: [
            {
              type: 'column',
              content: [{ type: 'component', componentType: 'panel' }],
            },
          ],
        },
      });
      const row = layout.rootItem as RowOrColumn;
      const oldChild = row.contentItems[0];
      const newChild = layout.createAndInitContentItem(
        oldChild.toConfig(),
        row,
      );
      const failure = new Error('destroy failed');
      const destroySpy = vi
        .spyOn(oldChild, 'destroy')
        .mockImplementation(() => {
          throw failure;
        });
      try {
        expect(() => row.replaceChild(oldChild, newChild, true)).toThrow(
          failure,
        );
        expect(row.contentItems).toEqual([oldChild]);
        expect(oldChild.element.parentNode).toBe(row.element);
        expect(newChild.element.parentNode).toBeNull();
      } finally {
        destroySpy.mockRestore();
        newChild.destroy();
      }
    } finally {
      layout.destroy();
    }
  });
});

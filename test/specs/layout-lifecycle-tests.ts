import { afterEach, describe, expect, it } from 'vitest';
import { StrelitLayout } from '../../src';

describe('layout lifecycle', () => {
  const layouts: StrelitLayout[] = [];

  afterEach(() => {
    for (const layout of layouts) {
      layout.destroy();
    }
  });

  it('does not initialize an initialized layout again', () => {
    const layout = new StrelitLayout();
    layouts.push(layout);
    const groundItem = layout.groundItem;
    const containerChildCount = layout.container.childElementCount;

    layout.init();

    expect(layout.groundItem).toBe(groundItem);
    expect(layout.container.childElementCount).toBe(containerChildCount);
  });
});

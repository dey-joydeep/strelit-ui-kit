import { afterEach, describe, expect, it } from 'vitest';
import { StrelitLayout, VirtualLayout } from '../../src';

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

  it('does not initialize after being destroyed before initialization', () => {
    const layout = new VirtualLayout(undefined, undefined, undefined, true);
    layouts.push(layout);

    layout.destroy();
    layout.init();

    expect(layout.isDestroyed).toBe(true);
    expect(layout.isInitialised).toBe(false);
    expect(layout.groundItem).toBeUndefined();
  });
});

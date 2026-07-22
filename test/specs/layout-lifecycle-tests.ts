import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrelitLayout, VirtualLayout } from '../../src';
import { eventHubChildEventName } from '../../src/ts/utils/event-hub';

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
    const removeEventListener = vi.spyOn(globalThis, 'removeEventListener');
    const layout = new VirtualLayout(undefined, undefined, undefined, true);
    layouts.push(layout);

    layout.destroy();
    layout.init();

    expect(layout.isDestroyed).toBe(true);
    expect(layout.isInitialised).toBe(false);
    expect(layout.groundItem).toBeUndefined();
    expect(removeEventListener).toHaveBeenCalledWith(
      eventHubChildEventName,
      expect.any(Function),
    );
  });
});

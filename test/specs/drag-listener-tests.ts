import { afterEach, describe, expect, it } from 'vitest';
import { DragListener } from '../../src/ts/utils/drag-listener';

describe('DragListener iframe handling', () => {
  const elements: HTMLElement[] = [];

  afterEach(() => {
    for (const element of elements.splice(0)) {
      element.remove();
    }
  });

  it('disables and restores pointer events for every iframe', () => {
    const handle = document.createElement('div');
    const first = document.createElement('iframe');
    const second = document.createElement('iframe');
    first.style.setProperty('pointer-events', 'auto');
    document.body.append(handle, first, second);
    elements.push(handle, first, second);
    const listener = new DragListener(handle, []);

    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 0,
        clientY: 0,
        isPrimary: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 20,
        clientY: 20,
        isPrimary: true,
      }),
    );

    expect(first.style.getPropertyValue('pointer-events')).toBe('none');
    expect(second.style.getPropertyValue('pointer-events')).toBe('none');
    document.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, isPrimary: true }),
    );
    expect(first.style.getPropertyValue('pointer-events')).toBe('auto');
    expect(second.style.getPropertyValue('pointer-events')).toBe('');
    listener.destroy();
  });

  it('ends an active drag when the pointer is cancelled', () => {
    const handle = document.createElement('div');
    const iframe = document.createElement('iframe');
    document.body.append(handle, iframe);
    elements.push(handle, iframe);
    const listener = new DragListener(handle, []);

    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 0,
        clientY: 0,
        isPrimary: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 20,
        clientY: 20,
        isPrimary: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointercancel', { bubbles: true, isPrimary: true }),
    );

    expect(listener.isTracking).toBe(false);
    expect(document.body.classList.contains('lm_dragging')).toBe(false);
    expect(iframe.style.getPropertyValue('pointer-events')).toBe('');
    listener.destroy();
  });
});

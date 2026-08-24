import { afterEach, describe, expect, it, vi } from 'vitest';
import { DragListener } from '../../src/ts/utils/drag-listener';

describe('DragListener iframe handling', () => {
  const elements: HTMLElement[] = [];

  afterEach(() => {
    vi.useRealTimers();
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

  it('ignores non-primary mouse buttons while preserving pointer input', () => {
    const handle = document.createElement('div');
    document.body.append(handle);
    elements.push(handle);
    const listener = new DragListener(handle, []);

    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 2,
        clientX: 0,
        clientY: 0,
        isPrimary: true,
        pointerType: 'mouse',
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 20,
        clientY: 20,
        isPrimary: true,
        pointerType: 'mouse',
      }),
    );

    expect(listener.isTracking).toBe(false);
    expect(document.body.classList.contains('lm_dragging')).toBe(false);
    listener.destroy();
  });

  it('ignores events from pointers that did not start the drag', () => {
    const handle = document.createElement('div');
    document.body.append(handle);
    elements.push(handle);
    const listener = new DragListener(handle, []);
    const dragStop = vi.fn();
    listener.on('dragStop', dragStop);

    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 0,
        clientY: 0,
        isPrimary: true,
        pointerId: 7,
        pointerType: 'touch',
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 20,
        clientY: 20,
        pointerId: 7,
        pointerType: 'touch',
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 8,
        pointerType: 'touch',
      }),
    );

    expect(listener.isTracking).toBe(true);
    expect(document.body.classList.contains('lm_dragging')).toBe(true);
    expect(dragStop).not.toHaveBeenCalled();

    document.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 7,
        pointerType: 'touch',
      }),
    );
    expect(listener.isTracking).toBe(false);
    expect(dragStop).toHaveBeenCalledOnce();
    listener.destroy();
  });

  it('transfers delayed-drag ownership without orphaning the previous timer', () => {
    vi.useFakeTimers();
    const handle = document.createElement('div');
    const iframe = document.createElement('iframe');
    document.body.append(handle, iframe);
    elements.push(handle, iframe);
    const listener = new DragListener(handle, []);
    const dragStart = vi.fn();
    listener.on('dragStart', dragStart);

    for (const pointerId of [1, 2]) {
      handle.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          isPrimary: true,
          pointerId,
          pointerType: 'touch',
        }),
      );
    }
    document.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 2,
        pointerType: 'touch',
      }),
    );
    vi.runAllTimers();

    expect(listener.isTracking).toBe(false);
    expect(dragStart).not.toHaveBeenCalled();
    expect(document.body.classList.contains('lm_dragging')).toBe(false);
    expect(iframe.style.getPropertyValue('pointer-events')).toBe('');
    listener.destroy();
  });

  it('does not resume pointer tracking after dragStop destroys the listener', () => {
    vi.useFakeTimers();
    const handle = document.createElement('div');
    document.body.append(handle);
    elements.push(handle);
    const listener = new DragListener(handle, []);
    const dragStart = vi.fn();
    listener.on('dragStart', dragStart);
    listener.on('dragStop', () => listener.destroy());

    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        isPrimary: true,
        pointerId: 1,
        pointerType: 'touch',
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 20,
        clientY: 20,
        pointerId: 1,
        pointerType: 'touch',
      }),
    );
    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        isPrimary: true,
        pointerId: 2,
        pointerType: 'touch',
      }),
    );
    vi.runAllTimers();

    expect(listener.isTracking).toBe(false);
    expect(dragStart).toHaveBeenCalledOnce();
    expect(document.body.classList.contains('lm_dragging')).toBe(false);
  });
});

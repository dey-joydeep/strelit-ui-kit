import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentContainer } from '../../src';
import { ColorComponent } from '../../apitest/color-component';

describe('API test contracts', () => {
  it('associates every labelled control with an existing element', () => {
    const html = readFileSync(resolve('apitest/index.html'), 'utf8');
    const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
    const labels = Array.from(parsedDocument.querySelectorAll('label[for]'));

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      const controlId = label.getAttribute('for');
      expect(controlId).not.toBeNull();
      expect(parsedDocument.getElementById(controlId!)).not.toBeNull();
    }
  });

  it('stops handling color input after component release', () => {
    const listeners = new Map<string, Set<() => void>>();
    const containerElement = document.createElement('div');
    const container = {
      element: containerElement,
      title: 'Color',
      stateRequestEvent: undefined,
      addEventListener(eventName: string, listener: () => void) {
        let eventListeners = listeners.get(eventName);
        if (eventListeners === undefined) {
          eventListeners = new Set();
          listeners.set(eventName, eventListeners);
        }
        eventListeners.add(listener);
      },
      removeEventListener(eventName: string, listener: () => void) {
        listeners.get(eventName)?.delete(listener);
      },
      focus: vi.fn(),
    } as unknown as ComponentContainer;

    new ColorComponent(container, undefined, false);
    const paragraph = containerElement.querySelector('p');
    const input = containerElement.querySelector('input');
    expect(paragraph).not.toBeNull();
    expect(input).not.toBeNull();

    input!.value = 'blue';
    input!.dispatchEvent(new Event('input'));
    expect(paragraph!.style.color).toBe('blue');

    for (const listener of listeners.get('beforeComponentRelease') ?? []) {
      listener();
    }
    input!.value = 'green';
    input!.dispatchEvent(new Event('input'));
    expect(paragraph!.style.color).toBe('blue');
  });
});

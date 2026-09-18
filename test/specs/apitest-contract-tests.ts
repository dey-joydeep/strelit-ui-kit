import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentContainer } from '../../src';
import { ColorComponent } from '../../apitest/color-component';

const require = createRequire(import.meta.url);
const smoke = require('../../scripts/smoke-apitest.js') as {
  observePreview(
    preview: EventEmitter & {
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
    },
  ): { assertRunning(): void; dispose(): void };
  waitForServer(
    previewMonitor: { assertRunning(): void },
    targetUrl: string,
    timeoutMs?: number,
  ): Promise<void>;
};

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

  it('rejects stale content when preview exits on an occupied port', async () => {
    const preview = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
    });
    let requests = 0;
    const server = createServer((_request, response) => {
      requests++;
      preview.exitCode = 1;
      preview.emit('close', 1, null);
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(
        '<div class="lm_strelit lm_root lm_item" data-strelit-smoke="passed"></div>',
      );
    });
    await new Promise<void>((resolveListen) => {
      server.listen(0, '127.0.0.1', resolveListen);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      server.close();
      throw new Error('Expected an occupied TCP port');
    }
    const monitor = smoke.observePreview(preview);

    try {
      await expect(
        smoke.waitForServer(
          monitor,
          `http://127.0.0.1:${address.port}/?smoke=1`,
          1_000,
        ),
      ).rejects.toThrow('Vite preview exited before smoke validation');
      expect(requests).toBe(1);
    } finally {
      monitor.dispose();
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) =>
          error === undefined ? resolveClose() : rejectClose(error),
        );
      });
    }
  });
});

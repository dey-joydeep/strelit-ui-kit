import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComponentContainer,
  StrelitLayout,
  LayoutConfig,
  ComponentItem,
} from '../../src';

describe('BrowserPopout functionality (item.popout())', function () {
  let layout: StrelitLayout;

  beforeEach(function () {
    layout = new StrelitLayout();
    layout.registerComponentFactoryFunction(
      'testComponent',
      (container: ComponentContainer) => {
        const span = document.createElement('span');
        span.innerText = 'popout test';
        container.element.appendChild(span);
      },
    );
  });

  afterEach(function () {
    layout.destroy();
  });

  it('creates a BrowserPopout and tracks open popouts', function () {
    const mockWindow = {
      closed: false,
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      document: {
        createElement: () => document.createElement('div'),
        body: document.createElement('body'),
        head: document.createElement('head'),
        write: vi.fn(),
        close: vi.fn(),
      },
      location: { href: '' },
    } as unknown as Window;

    const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWindow);

    const config: LayoutConfig = {
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            id: 'compA',
            componentType: 'testComponent',
          },
        ],
      },
    };

    layout.loadLayout(config);

    expect(layout.openPopouts.length).toBe(0);

    const compA = layout.findFirstComponentItemById('compA') as ComponentItem;
    expect(compA).toBeDefined();

    const popout = compA.popout();

    expect(openSpy).toHaveBeenCalled();
    expect(layout.openPopouts.length).toBe(1);
    expect(layout.openPopouts[0]).toBe(popout);

    openSpy.mockRestore();
  });

  it('keeps the item in the layout when popup creation is blocked', function () {
    vi.spyOn(window, 'open').mockReturnValue(null);

    layout.loadLayout({
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            id: 'blockedPopoutComponent',
            componentType: 'testComponent',
          },
        ],
      },
      settings: {
        blockedPopoutsThrowError: false,
      },
    });

    const item = layout.findFirstComponentItemById(
      'blockedPopoutComponent',
    ) as ComponentItem;
    item.popout();

    expect(
      layout.findFirstComponentItemById('blockedPopoutComponent'),
    ).toBeDefined();
    expect(
      layout.findFirstComponentItemById('blockedPopoutComponent')?.id,
    ).toBe(item.id);
    expect(layout.openPopouts.length).toBe(0);
  });

  it('restores incoming openPopouts when loading a new layout config', function () {
    const mockWindow = {
      closed: false,
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      document: {
        createElement: () => document.createElement('div'),
        body: document.createElement('body'),
        head: document.createElement('head'),
        write: vi.fn(),
        close: vi.fn(),
      },
      location: { href: '' },
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(mockWindow);

    const createPopoutSpy = vi.spyOn(
      layout as unknown as {
        createPopoutFromPopoutLayoutConfig: (config: unknown) => unknown;
      },
      'createPopoutFromPopoutLayoutConfig',
    );

    layout.loadLayout({
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            componentType: 'testComponent',
          },
        ],
      },
      openPopouts: [
        {
          root: {
            type: 'component',
            componentType: 'testComponent',
          },
          parentId: null,
          indexInParent: null,
          window: {
            width: 320,
            height: 200,
          },
        },
      ],
    });

    expect(createPopoutSpy).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComponentContainer,
  StrelitLayout,
  LayoutConfig,
  ComponentItem,
} from '../../src';

describe('Component Focus API (replaces legacy v1 selection model)', function () {
  let layout: StrelitLayout;

  beforeEach(function () {
    layout = new StrelitLayout();

    function Recorder(container: ComponentContainer) {
      const span = document.createElement('span');
      span.innerText = 'component content';
      container.element.appendChild(span);
    }

    layout.registerComponentFactoryFunction('testComponent', Recorder);
  });

  afterEach(function () {
    layout.destroy();
  });

  it('can focus a component programmatically and emit focus/blur events', function () {
    const config: LayoutConfig = {
      root: {
        type: 'row',
        content: [
          {
            type: 'component',
            id: 'compA',
            componentType: 'testComponent',
          },
          {
            type: 'component',
            id: 'compB',
            componentType: 'testComponent',
          },
        ],
      },
    };

    layout.loadLayout(config);

    const compA = layout.findFirstComponentItemById('compA') as ComponentItem;
    const compB = layout.findFirstComponentItemById('compB') as ComponentItem;

    expect(compA).toBeDefined();
    expect(compB).toBeDefined();

    expect(layout.focusedComponentItem).toBeUndefined();
    expect(compA.focused).toBe(false);
    expect(compB.focused).toBe(false);

    const focusSpyA = vi.fn();
    const blurSpyA = vi.fn();
    compA.addEventListener('focus', focusSpyA);
    compA.addEventListener('blur', blurSpyA);

    layout.focusComponent(compA);

    expect(layout.focusedComponentItem).toBe(compA);
    expect(compA.focused).toBe(true);
    expect(compB.focused).toBe(false);
    expect(focusSpyA).toHaveBeenCalledTimes(1);

    layout.focusComponent(compB);

    expect(layout.focusedComponentItem).toBe(compB);
    expect(compA.focused).toBe(false);
    expect(compB.focused).toBe(true);
    expect(blurSpyA).toHaveBeenCalledTimes(1);

    layout.clearComponentFocus();
    expect(layout.focusedComponentItem).toBeUndefined();
    expect(compB.focused).toBe(false);
  });
});

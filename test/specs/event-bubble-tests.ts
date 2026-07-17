import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComponentContainer,
  StrelitLayout,
  LayoutConfig,
  ComponentItem,
} from '../../src';
import { eventHubChildEventName } from '../../src/ts/utils/event-hub';

describe('Event Bubbling up the layout hierarchy', function () {
  let layout: StrelitLayout;

  beforeEach(function () {
    layout = new StrelitLayout();
    layout.registerComponentFactoryFunction(
      'testComponent',
      (container: ComponentContainer) => {
        const span = document.createElement('span');
        span.innerText = 'bubble test';
        container.element.appendChild(span);
      },
    );
  });

  afterEach(function () {
    layout.destroy();
  });

  it('emits base bubbling events from item up to root item and layout manager', function () {
    const config: LayoutConfig = {
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            id: 'targetComp',
            componentType: 'testComponent',
          },
        ],
      },
    };

    layout.loadLayout(config);

    const comp = layout.findFirstComponentItemById(
      'targetComp',
    ) as ComponentItem;
    expect(comp).toBeDefined();

    const layoutFocusSpy = vi.fn();
    layout.addEventListener('focus', layoutFocusSpy);

    comp.focus();

    expect(layoutFocusSpy).toHaveBeenCalled();
  });
});

describe('Event hub protocol', function () {
  it('uses the Strelit child-window event name', function () {
    expect(eventHubChildEventName).toBe('strelit_child_event');
  });
});

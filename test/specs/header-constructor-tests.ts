import { describe, expect, it, vi } from 'vitest';
import { type LayoutConfig, Stack } from '../../src';
import { Header, type HeaderSettings } from '../../src/ts/controls/header';
import { Side } from '../../src/ts/utils/types';
import TestTools from './test-tools';

describe('header construction', () => {
  it('captures the close callback without a receiver', () => {
    const config: LayoutConfig = {
      root: {
        type: 'stack',
        content: [
          { type: 'component', componentType: TestTools.TEST_COMPONENT_NAME },
        ],
      },
    };
    const layout = TestTools.createLayout(config);
    const stack = layout.rootItem;
    if (!(stack instanceof Stack)) {
      layout.destroy();
      throw new Error('Expected a stack root');
    }
    const settings: HeaderSettings = {
      show: true,
      side: Side.top,
      popoutEnabled: false,
      popoutLabel: '',
      maximiseEnabled: false,
      maximiseLabel: '',
      minimiseEnabled: false,
      minimiseLabel: '',
      closeEnabled: true,
      closeLabel: 'Close',
      tabDropdownEnabled: false,
      tabDropdownLabel: '',
    };
    const receivers: unknown[] = [];
    const initialClose = vi.fn(function (this: void) {
      receivers.push(this);
    });
    const replacementClose = vi.fn();
    const events = {
      getActiveComponentItem: () => stack.getActiveComponentItem(),
      close: initialClose,
      popout: undefined,
      maximiseToggle: undefined,
      click: undefined,
      touchStart: undefined,
      componentRemove: undefined,
      componentFocus: undefined,
      componentDragStart: undefined,
    };
    let header: Header | undefined;
    try {
      header = new Header(layout, stack, settings, true, events);
      events.close = replacementClose;
      const closeButton =
        header.controlsContainerElement.querySelector('.lm_close');
      if (closeButton === null) {
        throw new Error('Expected a close button');
      }
      closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(initialClose).toHaveBeenCalledOnce();
      expect(replacementClose).not.toHaveBeenCalled();
      expect(receivers).toEqual([undefined]);
    } finally {
      header?.destroy();
      layout.destroy();
    }
  });
});

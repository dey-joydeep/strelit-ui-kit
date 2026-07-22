import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrelitLayout, LayoutConfig } from '../../src';
import TestTools from './test-tools';

describe('drag source', function () {
  let layout: StrelitLayout;
  let dragSourceElement: HTMLDivElement;
  const createdFromDragSourceClass = 'createdFromDragSource';

  beforeEach(function () {
    const rootLayout: LayoutConfig = {
      settings: { reorderEnabled: false },
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            componentType: TestTools.TEST_COMPONENT_NAME,
            componentState: { html: '<div id="item-1"></div>' },
          },
        ],
      },
    };

    layout = TestTools.createLayout(rootLayout);
    expect(layout.isInitialised).toBe(true);
  });

  afterEach(function () {
    layout.destroy();
  });

  it('creates a new component from a deferred Strelit component config', function () {
    dragSourceElement = document.createElement('div');
    dragSourceElement.id = 'dragSrc';
    document.body.appendChild(dragSourceElement);

    const componentType = TestTools.TEST_COMPONENT_NAME;
    const componentState = {
      html: `<div class="${createdFromDragSourceClass}"></div>`,
    };
    const componentTitle = 'created from drag source';

    layout.newDragSource(dragSourceElement, () => ({
      type: 'component',
      componentType,
      componentState,
      title: componentTitle,
    }));

    doComponentDragTest();
  });

  it('disables container constraints for external drag sources', function () {
    dragSourceElement = document.createElement('div');
    layout.newDragSource(dragSourceElement, () => ({
      type: 'component',
      componentType: TestTools.TEST_COMPONENT_NAME,
    }));

    expect(layout.layoutConfig.settings.constrainDragToContainer).toBe(false);
  });

  it('destroys the temporary ground item with the drag source', function () {
    dragSourceElement = document.createElement('div');
    const dragSource = layout.newDragSource(dragSourceElement, () => ({
      type: 'component',
      componentType: TestTools.TEST_COMPONENT_NAME,
    }));
    const internals = dragSource as unknown as {
      _dummyGroundContentItem: { destroy(): void };
    };
    const destroySpy = vi.spyOn(internals._dummyGroundContentItem, 'destroy');

    layout.removeDragSource(dragSource);

    expect(destroySpy).toHaveBeenCalledOnce();
  });

  function doComponentDragTest(): void {
    let dragProxy = TestTools.getDragProxy();
    expect(dragProxy).toBeNull();

    startDrag();
    doDrag();

    dragProxy = TestTools.getDragProxy();
    expect(dragProxy).toBeInstanceOf(HTMLDivElement);

    endDrag();

    dragProxy = TestTools.getDragProxy();
    expect(dragProxy).toBeNull();

    const componentItem = TestTools.verifyPath('row.1.stack.0', layout);
    expect(
      componentItem.element.querySelectorAll(`.${createdFromDragSourceClass}`)
        .length,
    ).toBe(1, 'number of .dragged elements inside dropped element');
    expect(componentItem.tab.reorderEnabled).toBe(false);
  }

  function startDrag(): void {
    const rect = dragSourceElement.getBoundingClientRect();
    const pointerDownEvent = new PointerEvent('pointerdown', {
      bubbles: true,
      clientX: rect.left,
      clientY: rect.top,
      isPrimary: true,
    });
    dragSourceElement.dispatchEvent(pointerDownEvent);
  }

  function doDrag(): void {
    const rootRect = layout.rootItem?.element.getBoundingClientRect();
    if (rootRect === undefined) {
      throw new Error('no root rectangle!');
    }
    // choose a point on the far right side
    const pointerMoveX = rootRect.left + rootRect.width * 0.9;
    const pointerMoveY = rootRect.top + rootRect.height * 0.5;

    const pointerMoveEvent = new PointerEvent('pointermove', {
      bubbles: true,
      clientX: pointerMoveX,
      clientY: pointerMoveY,
    });
    document.dispatchEvent(pointerMoveEvent);
  }

  function endDrag(): void {
    const pointerUpEvent = new PointerEvent('pointerup', { bubbles: true });
    document.dispatchEvent(pointerUpEvent);
  }
});

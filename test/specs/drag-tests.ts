import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComponentContainer,
  ComponentItem,
  StrelitLayout,
  LayoutConfig,
} from '../../src';
import { DragProxy } from '../../src/ts/controls/drag-proxy';
import { DragListener } from '../../src/ts/utils/drag-listener';
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

  it('releases an external component when drag proxy construction fails', function () {
    dragSourceElement = document.createElement('div');
    const dragSource = layout.newDragSource(dragSourceElement, () => ({
      type: 'component',
      componentType: TestTools.TEST_COMPONENT_NAME,
    }));
    const destroyContainer = vi.spyOn(ComponentContainer.prototype, 'destroy');
    vi.spyOn(layout, 'calculateItemAreas').mockImplementationOnce(() => {
      throw new Error('item area calculation failed');
    });
    const internals = dragSource as unknown as {
      _dummyGroundContentItem: {
        contentItems: Array<{ contentItems: unknown[] }>;
      };
      onDragStart(x: number, y: number): void;
    };
    const originalChildCount =
      internals._dummyGroundContentItem.contentItems.length;

    expect(() => internals.onDragStart(0, 0)).toThrow(
      'item area calculation failed',
    );

    expect(internals._dummyGroundContentItem.contentItems).toHaveLength(
      originalChildCount,
    );
    expect(countComponentItems(internals._dummyGroundContentItem)).toBe(0);
    expect(destroyContainer).toHaveBeenCalledOnce();
    expect(TestTools.getDragProxy()).toBeNull();
  });

  function countComponentItems(item: {
    contentItems: Array<{ contentItems: unknown[] }>;
  }): number {
    let result = 0;
    for (const child of item.contentItems) {
      if (child instanceof ComponentItem) {
        result++;
      }
      result += countComponentItems(
        child as { contentItems: Array<{ contentItems: unknown[] }> },
      );
    }
    return result;
  }

  it('does not recreate an external drag listener during layout destruction', function () {
    dragSourceElement = document.createElement('div');
    document.body.appendChild(dragSourceElement);
    const dragSource = layout.newDragSource(dragSourceElement, () => ({
      type: 'component',
      componentType: TestTools.TEST_COMPONENT_NAME,
    }));
    const internals = dragSource as unknown as {
      _dragListener: DragListener | null;
    };

    dragSourceElement.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        isPrimary: true,
        pointerId: 31,
        pointerType: 'touch',
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 20,
        clientY: 20,
        pointerId: 31,
        pointerType: 'touch',
      }),
    );
    expect(TestTools.getDragProxy()).not.toBeNull();

    layout.destroy();

    expect(TestTools.getDragProxy()).toBeNull();
    expect(internals._dragListener).toBeNull();
  });

  it('uses document scroll offsets for constrained drag bounds', function () {
    const element = document.createElement('div');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 10, y: 20, width: 300, height: 200 }),
    );
    vi.spyOn(globalThis, 'scrollX', 'get').mockReturnValue(40);
    vi.spyOn(globalThis, 'scrollY', 'get').mockReturnValue(60);
    const proxyInternals = {
      _layoutManager: { groundItem: { element } },
      _minX: 0,
      _minY: 0,
      _maxX: 0,
      _maxY: 0,
    };
    const determineMinMaxXY = (
      DragProxy.prototype as unknown as {
        determineMinMaxXY(this: typeof proxyInternals): void;
      }
    ).determineMinMaxXY.bind(proxyInternals);

    determineMinMaxXY();

    expect(proxyInternals).toMatchObject({
      _minX: 50,
      _minY: 80,
      _maxX: 350,
      _maxY: 280,
    });
  });

  it('restores a focused component when drag construction blur fails', function () {
    const contentItem = layout.rootItem?.contentItems[0];
    if (
      contentItem === undefined ||
      !contentItem.isComponent ||
      contentItem.parent === null
    ) {
      throw new Error('Expected a component item');
    }
    const item = contentItem as ComponentItem;
    item.focus();
    const originalParent = item.parent;
    if (originalParent === null) {
      throw new Error('Expected a component parent');
    }
    const originalElementParent = item.element.parentElement;
    const listenerElement = document.createElement('div');
    const dragListener = new DragListener(listenerElement, []);
    const blurObserver = () => {
      throw new Error('blur observer failed');
    };
    item.on('blur', blurObserver);

    try {
      expect(
        () => new DragProxy(0, 0, dragListener, layout, item, originalParent),
      ).toThrow('blur observer failed');

      expect(item.parent).toBe(originalParent);
      expect(originalParent.contentItems).toContain(item);
      expect(item.element.parentElement).toBe(originalElementParent);
      expect(item.focused).toBe(true);
      expect(TestTools.getDragProxy()).toBeNull();
    } finally {
      item.off('blur', blurObserver);
      dragListener.destroy();
    }
  });

  it.each(['drop target', 'exit drag mode'] as const)(
    'restores a dragged component when %s fails before commit',
    (failureStage) => {
      const contentItem = layout.rootItem?.contentItems[0];
      if (
        contentItem === undefined ||
        !contentItem.isComponent ||
        contentItem.parent === null
      ) {
        throw new Error('Expected a component item');
      }
      const item = contentItem as ComponentItem;
      item.focus();
      const source = item.parent;
      if (source === null) {
        throw new Error('Expected a component parent');
      }
      const dragListener = new DragListener(document.createElement('div'), []);
      const proxy = new DragProxy(0, 0, dragListener, layout, item, source);
      const itemDropped = vi.fn();
      layout.on('itemDropped', itemDropped);
      if (failureStage === 'exit drag mode') {
        vi.spyOn(item, 'exitDragMode').mockImplementationOnce(() => {
          throw new Error('exit drag mode failed');
        });
      } else {
        const area = {
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          surface: 1,
          contentItem: {
            onDrop: () => {
              throw new Error('drop target failed');
            },
          },
        };
        (proxy as unknown as { _area: typeof area })._area = area;
      }

      try {
        expect(() =>
          (proxy as unknown as { onDrop(cancelled?: boolean): void }).onDrop(
            false,
          ),
        ).toThrow(
          failureStage === 'exit drag mode'
            ? 'exit drag mode failed'
            : 'drop target failed',
        );

        expect(item.parent).toBe(source);
        expect(source.contentItems).toContain(item);
        expect(item.focused).toBe(true);
        expect(TestTools.getDragProxy()).toBeNull();
        expect(itemDropped).not.toHaveBeenCalled();
      } finally {
        dragListener.destroy();
      }
    },
  );

  it('finishes committed-drop cleanup when the drop target throws', function () {
    layout.destroy();
    layout = TestTools.createLayout({
      root: {
        type: 'row',
        content: [
          {
            type: 'stack',
            id: 'source-stack',
            content: [
              {
                type: 'component',
                id: 'dragged-item',
                componentType: TestTools.TEST_COMPONENT_NAME,
              },
            ],
          },
          {
            type: 'stack',
            id: 'target-stack',
            content: [
              {
                type: 'component',
                id: 'target-item',
                componentType: TestTools.TEST_COMPONENT_NAME,
              },
            ],
          },
        ],
      },
    });
    const item = layout.findFirstComponentItemById('dragged-item');
    const source = layout.rootItem?.contentItems.find(
      (contentItem) => contentItem.id === 'source-stack',
    );
    const target = layout.rootItem?.contentItems.find(
      (contentItem) => contentItem.id === 'target-stack',
    );
    if (
      item === undefined ||
      source === undefined ||
      target === undefined ||
      !source.isStack ||
      !target.isStack
    ) {
      throw new Error('Expected drag source and target items');
    }
    item.focus();
    const dragListener = new DragListener(document.createElement('div'), []);
    const proxy = new DragProxy(0, 0, dragListener, layout, item, source);
    const itemDropped = vi.fn();
    layout.on('itemDropped', itemDropped);
    const area = {
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      surface: 1,
      contentItem: {
        onDrop: () => {
          target.addChild(item);
          throw new Error('drop observer failed');
        },
      },
    };
    (proxy as unknown as { _area: typeof area })._area = area;

    try {
      expect(() =>
        (proxy as unknown as { onDrop(cancelled?: boolean): void }).onDrop(
          false,
        ),
      ).toThrow('drop observer failed');

      expect(item.parent).toBe(target);
      expect(item.focused).toBe(true);
      expect(TestTools.getDragProxy()).toBeNull();
      expect(itemDropped).toHaveBeenCalledWith(item);
      expect(source.element.isConnected).toBe(false);
      expect(layout.rootItem).toBe(target);
    } finally {
      dragListener.destroy();
    }
  });

  it('restores an internal drag without dropping when the pointer is cancelled', function () {
    layout.destroy();
    layout = TestTools.createLayout({
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            id: 'cancelled-drag',
            componentType: TestTools.TEST_COMPONENT_NAME,
          },
        ],
      },
    });
    const item = layout.findFirstComponentItemById('cancelled-drag');
    if (item === undefined) {
      throw new Error('Expected a component item');
    }
    const itemDropped = vi.fn();
    const originalRoot = layout.rootItem;
    layout.on('itemDropped', itemDropped);

    item.tab.element.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 0,
        clientY: 0,
        isPrimary: true,
        pointerId: 9,
        pointerType: 'touch',
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 20,
        clientY: 20,
        pointerId: 9,
        pointerType: 'touch',
      }),
    );
    expect(TestTools.getDragProxy()).not.toBeNull();

    document.dispatchEvent(
      new PointerEvent('pointercancel', {
        bubbles: true,
        pointerId: 9,
        pointerType: 'touch',
      }),
    );

    expect(TestTools.getDragProxy()).toBeNull();
    expect(layout.findFirstComponentItemById('cancelled-drag')).toBe(item);
    expect(layout.rootItem).toBe(originalRoot);
    expect(layout.rootItem?.isStack).toBe(true);
    expect(itemDropped).not.toHaveBeenCalled();
  });

  it('cancels and owns an active drag during layout destruction', function () {
    layout.destroy();
    layout = TestTools.createLayout({
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            id: 'destroyed-drag',
            componentType: TestTools.TEST_COMPONENT_NAME,
          },
        ],
      },
    });
    const item = layout.findFirstComponentItemById('destroyed-drag');
    if (item === undefined) {
      throw new Error('Expected a component item');
    }
    item.tab.element.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        isPrimary: true,
        pointerId: 21,
        pointerType: 'touch',
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 20,
        clientY: 20,
        pointerId: 21,
        pointerType: 'touch',
      }),
    );
    expect(TestTools.getDragProxy()).not.toBeNull();

    expect(() => layout.destroy()).not.toThrow();

    expect(TestTools.getDragProxy()).toBeNull();
    expect((item as unknown as { _isDestroyed: boolean })._isDestroyed).toBe(
      true,
    );
  });

  it('restores a cancelled tab to its original index', function () {
    layout.destroy();
    layout = TestTools.createLayout({
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            id: 'first',
            componentType: TestTools.TEST_COMPONENT_NAME,
          },
          {
            type: 'component',
            id: 'second',
            componentType: TestTools.TEST_COMPONENT_NAME,
          },
        ],
      },
    });
    const item = layout.findFirstComponentItemById('first');
    if (item === undefined) {
      throw new Error('Expected a component item');
    }

    item.tab.element.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        isPrimary: true,
        pointerId: 10,
        pointerType: 'touch',
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 20,
        clientY: 20,
        pointerId: 10,
        pointerType: 'touch',
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointercancel', {
        bubbles: true,
        pointerId: 10,
        pointerType: 'touch',
      }),
    );

    expect(layout.rootItem?.contentItems.map((child) => child.id)).toEqual([
      'first',
      'second',
    ]);
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

    const componentItem = TestTools.verifyPath(
      'row.1.stack.0',
      layout,
    ) as ComponentItem;
    expect(
      componentItem.element.querySelectorAll(`.${createdFromDragSourceClass}`)
        .length,
    ).toBe(1);
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

import {
  UnexpectedNullError,
  UnexpectedUndefinedError,
} from '../errors/internal-error';
import { ComponentItem } from '../items/component-item';
import { ContentItem, type ContentItemArea } from '../items/content-item';
import { Stack } from '../items/stack';
import { LayoutManager } from '../layout-manager';
import { DomConstants } from '../utils/dom-constants';
import { DragListener } from '../utils/drag-listener';
import { EventEmitter } from '../utils/event-emitter';
import { Side } from '../utils/types';
import { numberToPixels } from '../utils/utils';

/**
 * This class creates a temporary container
 * for the component whilst it is being dragged
 * and handles drag events
 * @internal
 */
export class DragProxy extends EventEmitter {
  private _area: ContentItemArea | null = null;
  private _lastValidArea: ContentItemArea | null = null;
  private _minX!: number;
  private _minY!: number;
  private _maxX!: number;
  private _maxY!: number;
  private _sided!: boolean;
  private _element!: HTMLElement;
  private _proxyContainerElement!: HTMLElement;
  private _componentItemFocused: boolean;
  private readonly _originalIndex: number;
  private readonly _originalParentWasClosable: boolean;
  private _dragListenersRegistered = false;
  private _finished = false;

  private readonly _onDragHandler = (
    offsetX: number,
    offsetY: number,
    event: PointerEvent,
  ) => this.onDrag(offsetX, offsetY, event);
  private readonly _onDragStopHandler = (event: PointerEvent | undefined) =>
    this.onDrop(event === undefined || event.type === 'pointercancel');

  get element(): HTMLElement {
    return this._element;
  }

  /**
   * @param x - The initial x position
   * @param y - The initial y position
   * @internal
   */
  constructor(
    x: number,
    y: number,
    private readonly _dragListener: DragListener,
    private readonly _layoutManager: LayoutManager,
    private readonly _componentItem: ComponentItem,
    private readonly _originalParent: ContentItem,
    private readonly _finishedEvent: (dragProxy: DragProxy) => void = () => {},
  ) {
    super();
    const originalParent = this._componentItem.parent;
    if (originalParent === null) {
      // Note that _contentItem will have dummy GroundItem as parent if initiated by a external drag source
      throw new UnexpectedNullError('DPC10097');
    }
    this._componentItemFocused = this._componentItem.focused;
    this._originalIndex = originalParent.contentItems.indexOf(
      this._componentItem,
    );
    this._originalParentWasClosable = this._originalParent.isClosable;
    const originalElementParent = this._componentItem.element.parentNode;
    const originalElementNextSibling = this._componentItem.element.nextSibling;
    try {
      this.createDragProxyElements(x, y);
      if (this._componentItemFocused) {
        this._componentItem.blur();
      }
      this.detachComponentItem();

      this.setDimensions();
      document.body.appendChild(this._element);
      this.determineMinMaxXY();
      this._layoutManager.calculateItemAreas();
      this.setDropPosition(x, y);
      this._dragListener.on('drag', this._onDragHandler);
      this._dragListener.on('dragStop', this._onDragStopHandler);
      this._dragListenersRegistered = true;
    } catch (error) {
      if (this._dragListenersRegistered) {
        this._dragListener.off('drag', this._onDragHandler);
        this._dragListener.off('dragStop', this._onDragStopHandler);
        this._dragListenersRegistered = false;
      }
      if (this._componentItem.parent === null) {
        this._originalParent.addChild(this._componentItem, this._originalIndex);
      }
      if (
        originalElementParent !== null &&
        this._componentItem.element.parentNode !== originalElementParent
      ) {
        originalElementParent.insertBefore(
          this._componentItem.element,
          originalElementNextSibling,
        );
      }
      this._element?.remove();
      if (this._componentItemFocused && !this._componentItem.focused) {
        this._componentItem.focus(true);
      }
      throw error;
    }
  }

  /** Cancels an active drag and performs the normal rollback cleanup. @internal */
  cancel(): void {
    this.onDrop(true);
  }

  /** Create Stack-like structure to contain the dragged component */
  private createDragProxyElements(initialX: number, initialY: number): void {
    this._element = document.createElement('div');
    this._element.classList.add(DomConstants.ClassName.DragProxy);
    const headerElement = document.createElement('div');
    headerElement.classList.add(DomConstants.ClassName.Header);
    const tabsElement = document.createElement('div');
    tabsElement.classList.add(DomConstants.ClassName.Tabs);
    const tabElement = document.createElement('div');
    tabElement.classList.add(DomConstants.ClassName.Tab);
    const titleElement = document.createElement('span');
    titleElement.classList.add(DomConstants.ClassName.Title);
    tabElement.appendChild(titleElement);
    tabsElement.appendChild(tabElement);
    headerElement.appendChild(tabsElement);

    this._proxyContainerElement = document.createElement('div');
    this._proxyContainerElement.classList.add(DomConstants.ClassName.Content);

    this._element.appendChild(headerElement);
    this._element.appendChild(this._proxyContainerElement);

    if (
      this._originalParent instanceof Stack &&
      this._originalParent.headerShow
    ) {
      this._sided = this._originalParent.headerLeftRightSided;
      switch (this._originalParent.headerSide) {
        case Side.left:
          this._element.classList.add(DomConstants.ClassName.Left);
          break;
        case Side.right:
          this._element.classList.add(DomConstants.ClassName.Right);
          break;
        case Side.bottom:
          this._element.classList.add(DomConstants.ClassName.Bottom);
          break;
      }
      if (
        this._originalParent.headerSide === Side.right ||
        this._originalParent.headerSide === Side.bottom
      ) {
        this._proxyContainerElement.insertAdjacentElement(
          'afterend',
          headerElement,
        );
      }
    }
    this._element.style.left = numberToPixels(initialX);
    this._element.style.top = numberToPixels(initialY);
    tabElement.setAttribute('title', this._componentItem.title);
    titleElement.insertAdjacentText('afterbegin', this._componentItem.title);
    this._proxyContainerElement.appendChild(this._componentItem.element);
  }

  private determineMinMaxXY(): void {
    const groundItem = this._layoutManager.groundItem;
    if (groundItem === undefined) {
      throw new UnexpectedUndefinedError('DPDMMXY73109');
    } else {
      const groundElement = groundItem.element;
      const rect = groundElement.getBoundingClientRect();
      this._minX = rect.left + globalThis.scrollX;
      this._minY = rect.top + globalThis.scrollY;
      this._maxX = this._minX + rect.width;
      this._maxY = this._minY + rect.height;
    }
  }

  /**
   * Callback on every mouseMove event during a drag. Determines if the drag is
   * still within the valid drag area and calls the layoutManager to highlight the
   * current drop area
   *
   * @param offsetX - The difference from the original x position in px
   * @param offsetY - The difference from the original y position in px
   * @param event -
   * @internal
   */
  private onDrag(offsetX: number, offsetY: number, event: PointerEvent) {
    const x = event.pageX;
    const y = event.pageY;

    this.setDropPosition(x, y);
    this._componentItem.drag();
  }

  /**
   * Sets the target position, highlighting the appropriate area
   *
   * @param x - The x position in px
   * @param y - The y position in px
   *
   * @internal
   */
  private setDropPosition(x: number, y: number): void {
    if (this._layoutManager.layoutConfig.settings.constrainDragToContainer) {
      if (x <= this._minX) {
        x = Math.ceil(this._minX);
      } else if (x >= this._maxX) {
        x = Math.floor(this._maxX);
      }

      if (y <= this._minY) {
        y = Math.ceil(this._minY);
      } else if (y >= this._maxY) {
        y = Math.floor(this._maxY);
      }
    }

    this._element.style.left = numberToPixels(x);
    this._element.style.top = numberToPixels(y);
    this._area = this._layoutManager.getArea(x, y);

    if (this._area !== null) {
      this._lastValidArea = this._area;
      this._area.contentItem.highlightDropZone(x, y, this._area);
    }
  }

  /**
   * Callback when the drag has finished. Determines the drop area
   * and adds the child to it
   * @internal
   */
  private onDrop(cancelled = false): void {
    if (this._finished) {
      return;
    }
    let firstError: unknown;
    const attempt = (action: () => void) => {
      try {
        action();
      } catch (error) {
        firstError ??= error;
      }
    };
    const dropTargetIndicator = this._layoutManager.dropTargetIndicator;
    if (dropTargetIndicator === null) {
      firstError = new UnexpectedNullError('DPOD30011');
    } else {
      attempt(() => dropTargetIndicator.hide());
    }

    if (this._dragListenersRegistered) {
      attempt(() => this._dragListener.off('drag', this._onDragHandler));
      attempt(() =>
        this._dragListener.off('dragStop', this._onDragStopHandler),
      );
      this._dragListenersRegistered = false;
    }
    attempt(() => this._componentItem.exitDragMode());

    /*
     * Valid drop area found
     */
    let droppedComponentItem: ComponentItem | undefined;
    try {
      if (firstError !== undefined) {
        this.restoreComponentItem();
      } else if (!cancelled && this._area !== null) {
        this._area.contentItem.onDrop(this._componentItem, this._area);
        droppedComponentItem = this._componentItem;
        if (
          this._originalParent &&
          (this._originalParent.isRow || this._originalParent.isColumn)
        ) {
          (
            this._originalParent as unknown as { checkCollapse(): void }
          ).checkCollapse();
        }

        /**
         * No valid drop area available at present, but one has been found before.
         * Use it
         */
      } else if (!cancelled && this._lastValidArea !== null) {
        const newParentContentItem = this._lastValidArea.contentItem;
        newParentContentItem.onDrop(this._componentItem, this._lastValidArea);
        droppedComponentItem = this._componentItem;
        if (
          this._originalParent &&
          (this._originalParent.isRow || this._originalParent.isColumn)
        ) {
          (
            this._originalParent as unknown as { checkCollapse(): void }
          ).checkCollapse();
        }

        /**
         * No valid drop area found during the duration of the drag. Return
         * content item to its original position if a original parent is provided.
         * (Which is not the case if the drag had been initiated by createDragSource)
         */
      } else if (this._originalParent && !this._originalParent.isGround) {
        this.restoreComponentItem();
        droppedComponentItem = this._componentItem;
      } else {
        this._componentItem.destroy(); // contentItem children are now destroyed as well
      }
    } catch (error) {
      firstError ??= error;
      if (
        this._componentItem.parent !== null &&
        this._componentItem.parent.contentItems.includes(this._componentItem)
      ) {
        droppedComponentItem = this._componentItem;
      } else {
        attempt(() => this.restoreComponentItem());
      }
    }

    attempt(() => this._element.remove());

    if (!cancelled && droppedComponentItem !== undefined) {
      attempt(() => this.removeEmptyOriginalParent());
    }

    if (!cancelled && droppedComponentItem !== undefined) {
      attempt(() =>
        this._layoutManager.emit('itemDropped', this._componentItem),
      );
    }

    if (this._componentItemFocused && this._componentItem.parent !== null) {
      attempt(() => this._componentItem.focus());
    }
    this._finished = true;
    this._finishedEvent(this);
    if (firstError !== undefined) {
      throw firstError;
    }
  }

  /**
   * Updates the Drag Proxy's dimensions
   * @internal
   */
  private setDimensions() {
    const dimensions = this._layoutManager.layoutConfig.dimensions;
    if (dimensions === undefined) {
      throw new Error('DragProxy.setDimensions: dimensions undefined');
    }

    let width = dimensions.dragProxyWidth;
    let height = dimensions.dragProxyHeight;
    if (width === undefined || height === undefined) {
      throw new Error('DragProxy.setDimensions: width and/or height undefined');
    }

    const headerHeight =
      this._layoutManager.layoutConfig.header.show === false
        ? 0
        : dimensions.headerHeight;
    this._element.style.width = numberToPixels(width);
    this._element.style.height = numberToPixels(height);
    width -= this._sided ? headerHeight : 0;
    height -= !this._sided ? headerHeight : 0;
    this._proxyContainerElement.style.width = numberToPixels(width);
    this._proxyContainerElement.style.height = numberToPixels(height);
    this._componentItem.enterDragMode(width, height);
    this._componentItem.show();
  }

  private isParentAttached(parent: ContentItem): boolean {
    let current: ContentItem | null = parent;
    while (current !== null && !current.isGround) {
      const nextParent: ContentItem | null = current.parent;
      if (nextParent === null || !nextParent.contentItems.includes(current)) {
        return false;
      }
      current = nextParent;
    }
    return current !== null && current.isGround;
  }

  private restoreComponentItem(): void {
    if (this._originalParent.isGround) {
      this._componentItem.destroy();
      return;
    }
    if (this.isParentAttached(this._originalParent)) {
      this._originalParent.addChild(this._componentItem, this._originalIndex);
      return;
    }
    const rootItem = this._layoutManager.rootItem;
    if (rootItem !== undefined) {
      rootItem.addChild(this._componentItem);
      return;
    }
    const groundItem = (
      this._layoutManager as unknown as { _groundItem?: ContentItem }
    )._groundItem;
    if (groundItem !== undefined) {
      groundItem.addChild(this._componentItem);
    } else {
      this._originalParent.addChild(this._componentItem);
    }
  }

  private detachComponentItem(): void {
    if (!(this._originalParent instanceof Stack)) {
      this._originalParent.removeChild(this._componentItem, true);
      return;
    }
    const parentInternals = this._originalParent as unknown as {
      _isClosable: boolean;
    };
    parentInternals._isClosable = false;
    try {
      this._originalParent.removeChild(this._componentItem, true);
    } finally {
      parentInternals._isClosable = this._originalParentWasClosable;
    }
  }

  private removeEmptyOriginalParent(): void {
    if (
      this._originalParent instanceof Stack &&
      this._originalParentWasClosable &&
      this._originalParent.contentItems.length === 0 &&
      this.isParentAttached(this._originalParent)
    ) {
      const parent = this._originalParent.parent;
      if (parent !== null) {
        parent.removeChild(this._originalParent);
      }
    }
  }
}

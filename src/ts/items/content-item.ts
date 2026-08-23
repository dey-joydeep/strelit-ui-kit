import { ResolvedItemConfig } from '../config/resolved-config';
import { BrowserPopout } from '../controls/browser-popout';
import { AssertError, UnexpectedNullError } from '../errors/internal-error';
import { LayoutManager } from '../layout-manager';
import { reportSecondaryCleanupError } from '../utils/error-reporting';
import {
  EventEmitter,
  EventEmitterBubblingEvent,
} from '../utils/event-emitter';
import {
  AreaLinkedRect,
  ComponentType,
  ItemType,
  SerializableObject,
  SizeUnit,
} from '../utils/types';
import {
  deepCloneValue,
  getUniqueId,
  setElementDisplayVisibility,
} from '../utils/utils';
import { ComponentItem } from './component-item';
import { ComponentParentableItem } from './component-parentable-item';
import { Stack } from './stack';

/**
 * Defines the content item area contract.
 * @public
 */
export interface ContentItemArea {
  /** The left edge. */
  x1: number;
  /** The right edge. */
  x2: number;
  /** The top edge. */
  y1: number;
  /** The bottom edge. */
  y2: number;
  /** The surface. */
  surface: number;
  /** The content item. */
  contentItem: ContentItem;
}

function areValidatedComponentTypesEqual(
  left: ComponentType,
  right: ComponentType,
): boolean {
  if (left === right) {
    return true;
  }

  if (left === null || right === null) {
    return false;
  }

  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    for (let i = 0; i < left.length; i++) {
      if (
        !areValidatedComponentTypesEqual(
          left[i] as ComponentType,
          right[i] as ComponentType,
        )
      ) {
        return false;
      }
    }

    return true;
  }

  if (Array.isArray(right)) {
    return false;
  }

  if (typeof left === 'object' && typeof right === 'object') {
    const leftJson = left as SerializableObject;
    const rightJson = right as SerializableObject;
    const leftKeys = Object.keys(leftJson);
    const rightKeys = Object.keys(rightJson);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (let i = 0; i < leftKeys.length; i++) {
      const key = leftKeys[i];
      if (!Object.prototype.hasOwnProperty.call(rightJson, key)) {
        return false;
      }

      if (
        !areValidatedComponentTypesEqual(
          leftJson[key] as ComponentType,
          rightJson[key] as ComponentType,
        )
      ) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function areComponentTypesEqual(
  left: ComponentType,
  right: ComponentType,
): boolean {
  return areValidatedComponentTypesEqual(
    deepCloneValue(left) as ComponentType,
    deepCloneValue(right) as ComponentType,
  );
}

/**
 * This is the baseclass that all content items inherit from.
 * Most methods provide a subset of what the sub-classes do.
 *
 * It also provides a number of functions for tree traversal
 * @public
 */

export abstract class ContentItem extends EventEmitter {
  /** @internal */
  private _type: ItemType;
  /** @internal */
  private _id: string;
  /** @internal */
  private _popInParentIds: string[] = [];
  /** @internal */
  private _contentItems: ContentItem[];
  /** @internal */
  private _isClosable;
  /** @internal */
  private _pendingEventPropagations: Record<string, unknown>;
  /** @internal */
  private _pendingEventPropagationFrames: Record<string, number | undefined>;
  /** @internal */
  private _throttledEvents: string[];
  /** @internal */
  private _isInitialised;
  /** @internal */
  protected _isDestroyed = false;
  /** @internal */
  protected _destroyCleanupFailed = false;
  private _beforeItemDestroyedEmitted = false;
  private _itemDestroyedEmitted = false;

  /** @internal */
  size: number;
  /** @internal */
  sizeUnit: SizeUnit;
  /** @internal */
  minSize: number | undefined;
  /** @internal */
  minSizeUnit: SizeUnit;

  /** Whether ground. */
  isGround: boolean;
  /** Whether row. */
  isRow: boolean;
  /** Whether column. */
  isColumn: boolean;
  /** Whether stack. */
  isStack: boolean;
  /** Whether component. */
  isComponent: boolean;

  /** Gets the type. */
  get type(): ItemType {
    return this._type;
  }
  /** Gets the id. */
  get id(): string {
    return this._id;
  }
  set id(value: string) {
    this._id = value;
  }
  /** @internal */
  get popInParentIds(): string[] {
    return this._popInParentIds;
  }
  /** Gets the parent. */
  get parent(): ContentItem | null {
    return this._parent;
  }
  /** Gets the content items. */
  get contentItems(): ContentItem[] {
    return this._contentItems;
  }
  /** Gets the is closable. */
  get isClosable(): boolean {
    return this._isClosable;
  }
  /** Gets the element. */
  get element(): HTMLElement {
    return this._element;
  }
  /** Gets the is initialised. */
  get isInitialised(): boolean {
    return this._isInitialised;
  }

  /** Returns whether stack. */
  static isStack(item: ContentItem): item is Stack {
    return item.isStack;
  }

  /** Returns whether component item. */
  static isComponentItem(item: ContentItem): item is ComponentItem {
    return item.isComponent;
  }

  /** Returns whether component parentable item. */
  static isComponentParentableItem(
    item: ContentItem,
  ): item is ComponentParentableItem {
    return item.isStack || item.isGround;
  }

  /** @internal */
  constructor(
    /** The layout manager that owns this item. */
    public readonly layoutManager: LayoutManager,
    config: ResolvedItemConfig,
    /** @internal */
    private _parent: ContentItem | null,
    /** @internal */
    private readonly _element: HTMLElement,
  ) {
    super();

    this._type = config.type;
    this._id = config.id;

    this._isInitialised = false;
    this.isGround = false;
    this.isRow = false;
    this.isColumn = false;
    this.isStack = false;
    this.isComponent = false;

    this.size = config.size;
    this.sizeUnit = config.sizeUnit;
    this.minSize = config.minSize;
    this.minSizeUnit = config.minSizeUnit;

    this._isClosable = config.isClosable;

    this._pendingEventPropagations = {};
    this._pendingEventPropagationFrames = {};
    this._throttledEvents = ['stateChanged'];

    this._contentItems = this.createContentItems(config.content);
  }

  /**
   * Updaters the size of the component and its children, called recursively
   * @param force - In some cases the size is not updated if it has not changed. In this case, events
   * (such as ComponentContainer.virtualRectingRequiredEvent) are not fired. Setting force to true, ensures the size is updated regardless, and
   * the respective events are fired. This is sometimes necessary when a component's size has not changed but it has become visible, and the
   * relevant events need to be fired.
   * @internal
   */
  abstract updateSize(force: boolean): void;

  /**
   * Removes a child node (and its children) from the tree
   * @param contentItem - The child item to remove
   * @param keepChild - Whether to destroy the removed item
   */
  removeChild(contentItem: ContentItem, keepChild = false): void {
    /*
     * Get the position of the item that's to be removed within all content items this node contains
     */
    const index = this._contentItems.indexOf(contentItem);

    /*
     * Make sure the content item to be removed is actually a child of this item
     */
    if (index === -1) {
      throw new Error("Can't remove child item. Unknown content item");
    }

    /**
     * Call destroy on the content item.
     * All children are destroyed as well
     */
    if (!keepChild) {
      this._contentItems[index].destroy();
    }

    /**
     * Remove the content item from this nodes array of children
     */
    this._contentItems.splice(index, 1);

    /**
     * If this node still contains other content items, adjust their size
     */
    if (this._contentItems.length > 0) {
      this.updateSize(false);
    } else {
      /**
       * If this was the last content item, remove this node as well
       */
      if (!this.isGround && this._isClosable) {
        if (this._parent === null) {
          throw new UnexpectedNullError('CIUC00874');
        } else {
          this._parent.removeChild(this);
        }
      }
    }
  }

  /**
   * Sets up the tree structure for the newly added child
   * The responsibility for the actual DOM manipulations lies
   * with the concrete item
   *
   * @param contentItem -
   * @param index - If omitted item will be appended
   * @param suspendResize - Used by descendent implementations
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addChild(
    contentItem: ContentItem,
    index?: number | null,
    suspendResize?: boolean,
  ): number {
    void suspendResize;
    index ??= this._contentItems.length;

    this._contentItems.splice(index, 0, contentItem);
    contentItem.setParent(this);

    if (this._isInitialised && !contentItem._isInitialised) {
      contentItem.init();
    }

    return index;
  }

  /**
   * Replaces oldChild with newChild
   * @param oldChild -
   * @param newChild -
   * @internal
   */
  replaceChild(
    oldChild: ContentItem,
    newChild: ContentItem,
    destroyOldChild = false,
  ): void {
    // Do not try to replace ComponentItem - will not work
    const index = this._contentItems.indexOf(oldChild);
    const parentNode = oldChild._element.parentNode;

    if (index === -1) {
      throw new AssertError(
        'CIRCI23232',
        "Can't replace child. oldChild is not child of this",
      );
    }

    if (parentNode === null) {
      throw new UnexpectedNullError('CIRCP23232');
    } else {
      /*
       * Optionally destroy the old content item
       */
      if (destroyOldChild) {
        const newChildParentNode = newChild._element.parentNode;
        const newChildNextSibling = newChild._element.nextSibling;
        const insertionAnchor = document.createComment(
          'strelit-replace-child-anchor',
        );
        parentNode.insertBefore(insertionAnchor, oldChild._element);
        try {
          parentNode.replaceChild(newChild._element, oldChild._element);
        } catch (error) {
          insertionAnchor.remove();
          throw error;
        }
        try {
          oldChild.destroy(); // will now also destroy all children of oldChild
        } catch (error) {
          try {
            parentNode.insertBefore(oldChild._element, insertionAnchor);
            newChild._element.remove();
            if (newChildParentNode !== null) {
              const insertionPoint =
                newChildNextSibling?.parentNode === newChildParentNode
                  ? newChildNextSibling
                  : null;
              newChildParentNode.insertBefore(
                newChild._element,
                insertionPoint,
              );
            }
            insertionAnchor.remove();
          } catch (rollbackError) {
            reportSecondaryCleanupError(
              'content-item replacement rollback',
              rollbackError,
            );
          }
          throw error;
        }
        oldChild._parent = null;
        insertionAnchor.remove();
      } else {
        parentNode.replaceChild(newChild._element, oldChild._element);
      }

      /*
       * Wire the new contentItem into the tree
       */
      this._contentItems[index] = newChild;
      newChild.setParent(this);
      // newChild inherits the sizes from the old child:
      newChild.size = oldChild.size;
      newChild.sizeUnit = oldChild.sizeUnit;
      newChild.minSize = oldChild.minSize;
      newChild.minSizeUnit = oldChild.minSizeUnit;

      // Saved layouts are derived from the live tree, so there is no retained
      // configuration object to update when replacing a runtime item.
      if (newChild._parent === null) {
        throw new UnexpectedNullError('CIRCNC45699');
      } else {
        if (newChild._parent._isInitialised && !newChild._isInitialised) {
          newChild.init();
        }

        this.updateSize(false);
      }
    }
  }

  /**
   * Convenience method.
   * Shorthand for this.parent.removeChild( this )
   */
  remove(): void {
    if (this._parent === null) {
      throw new UnexpectedNullError('CIR11110');
    } else {
      this._parent.removeChild(this);
    }
  }

  /**
   * Removes the component from the layout and creates a new
   * browser window with the component and its children inside
   */
  popout(): BrowserPopout {
    const parentId = getUniqueId();
    const browserPopout = this.layoutManager.createPopoutFromContentItem(
      this,
      undefined,
      parentId,
      undefined,
    );
    this.emitBaseBubblingEvent('stateChanged');
    return browserPopout;
  }

  /**
   * Returns every item in this subtree whose id matches `id`.
   * Includes this item when it matches.
   */
  getItemsById(id: string): ContentItem[] {
    return this.getItemsByFilter((item) => item.id === id);
  }

  /**
   * Returns every item in this subtree whose type matches `type`.
   * Includes this item when it matches.
   */
  getItemsByType(type: ItemType): ContentItem[] {
    return this.getItemsByFilter((item) => item.type === type);
  }

  /**
   * Returns every component item in this subtree whose componentType matches `componentType`.
   */
  getComponentItemsByType(componentType: ComponentType): ComponentItem[] {
    return this.getItemsByFilter(
      (item) =>
        ContentItem.isComponentItem(item) &&
        areComponentTypesEqual(item.componentType, componentType),
    ) as ComponentItem[];
  }

  /** Performs the to config operation. */
  abstract toConfig(): ResolvedItemConfig;

  /** @internal */
  calculateConfigContent(): ResolvedItemConfig[] {
    const contentItems = this._contentItems;
    const count = contentItems.length;
    const result = Array<ResolvedItemConfig>(count);
    for (let i = 0; i < count; i++) {
      const item = contentItems[i];
      result[i] = item.toConfig();
    }
    return result;
  }

  /** @internal */
  highlightDropZone(x: number, y: number, area: AreaLinkedRect): void {
    const dropTargetIndicator = this.layoutManager.dropTargetIndicator;
    if (dropTargetIndicator === null) {
      throw new UnexpectedNullError('ACIHDZ5593');
    } else {
      dropTargetIndicator.highlightArea(area, 1);
    }
  }

  /**
   * Adds a dropped item as a child in the base implementation.
   * @internal
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDrop(contentItem: ContentItem, area: ContentItemArea): void {
    this.addChild(contentItem);
  }

  /** @internal */
  show(): void {
    this.layoutManager.beginSizeInvalidation();
    try {
      setElementDisplayVisibility(this._element, true);

      for (let i = 0; i < this._contentItems.length; i++) {
        this._contentItems[i].show();
      }
    } finally {
      this.layoutManager.endSizeInvalidation();
    }
  }

  /**
   * Destroys this item ands its children
   * @internal
   */
  destroy(): void {
    if (this._isDestroyed && !this._destroyCleanupFailed) {
      return;
    }
    this._isDestroyed = true;
    let firstError: unknown;
    const attempt = (action: () => void) => {
      try {
        action();
      } catch (error) {
        firstError ??= error;
      }
    };
    for (const [name, frame] of Object.entries(
      this._pendingEventPropagationFrames,
    )) {
      if (frame !== undefined) {
        attempt(() => {
          globalThis.cancelAnimationFrame(frame);
          this._pendingEventPropagationFrames[name] = undefined;
        });
      }
    }
    const remainingContentItems: ContentItem[] = [];
    for (const contentItem of this._contentItems) {
      let destroyed = false;
      attempt(() => {
        contentItem.destroy();
        destroyed = true;
      });
      if (!destroyed) {
        remainingContentItems.push(contentItem);
      }
    }
    this._contentItems = remainingContentItems;

    if (!this._beforeItemDestroyedEmitted) {
      this._beforeItemDestroyedEmitted = true;
      attempt(() => this.emitBaseBubblingEvent('beforeItemDestroyed'));
    }
    attempt(() => this._element.remove());
    if (!this._itemDestroyedEmitted) {
      this._itemDestroyedEmitted = true;
      attempt(() => this.emitBaseBubblingEvent('itemDestroyed'));
    }
    if (firstError !== undefined) {
      this._destroyCleanupFailed = true;
      throw firstError;
    }
    this._destroyCleanupFailed = false;
  }

  /**
   * Returns the area the component currently occupies
   * @internal
   */
  getElementArea(element?: HTMLElement): ContentItemArea | null {
    element = element ?? this._element;

    const rect = element.getBoundingClientRect();
    const top = rect.top + globalThis.scrollY;
    const left = rect.left + globalThis.scrollX;

    const width = rect.width;
    const height = rect.height;

    return {
      x1: left,
      y1: top,
      x2: left + width,
      y2: top + height,
      surface: width * height,
      contentItem: this,
    };
  }

  /**
   * The tree of content items is created in two steps: First all content items are instantiated,
   * then init is called recursively from top to bottem. This is the basic init function,
   * it can be used, extended or overwritten by the content items
   *
   * Its behaviour depends on the content item
   * @internal
   */
  init(): void {
    this._isInitialised = true;
    this.emitBaseBubblingEvent('itemCreated');
    this.emitUnknownBubblingEvent(this.type + 'Created');
  }

  /** @internal */
  protected setParent(parent: ContentItem): void {
    this._parent = parent;
  }

  /** @internal */
  addPopInParentId(id: string): void {
    if (!this.popInParentIds.includes(id)) {
      this.popInParentIds.push(id);
    }
  }

  /** @internal */
  protected initContentItems(): void {
    for (let i = 0; i < this._contentItems.length; i++) {
      this._contentItems[i].init();
    }
  }

  /** @internal */
  protected hide(): void {
    this.layoutManager.beginSizeInvalidation();
    try {
      setElementDisplayVisibility(this._element, false);
      // this.layoutManager.updateSizeFromContainer();
    } finally {
      this.layoutManager.endSizeInvalidation();
    }
  }

  /** @internal */
  protected updateContentItemsSize(force: boolean): void {
    for (let i = 0; i < this._contentItems.length; i++) {
      this._contentItems[i].updateSize(force);
    }
  }

  /**
   * creates all content items for this node at initialisation time
   * PLEASE NOTE, please see addChild for adding contentItems at runtime
   * @internal
   */
  private createContentItems(content: readonly ResolvedItemConfig[]) {
    const result: ContentItem[] = [];
    try {
      for (let i = 0; i < content.length; i++) {
        result.push(this.layoutManager.createContentItem(content[i], this));
      }
    } catch (error) {
      for (let i = result.length - 1; i >= 0; i--) {
        try {
          result[i].destroy();
        } catch {
          // Continue releasing earlier siblings and preserve the construction error.
        }
      }
      throw error;
    }
    return result;
  }

  /**
   * Called for every event on the item tree. Decides whether the event is a bubbling
   * event and propagates it to its parent
   *
   * @param name - The name of the event
   * @param event -
   * @internal
   */
  private propagateEvent(name: string, args: unknown[]) {
    if (args.length === 1) {
      const event = args[0];
      if (
        event instanceof EventEmitterBubblingEvent &&
        !event.isPropagationStopped &&
        this._isInitialised
      ) {
        /**
         * In some cases (e.g. if an element is created from a DragSource) it
         * doesn't have a parent and is not a child of GroundItem. If that's the case
         * propagate the bubbling event from the top level of the substree directly
         * to the layoutManager
         */
        if (!this.isGround && this._parent) {
          this._parent.emitUnknown(name, event);
        } else {
          this.scheduleEventPropagationToLayoutManager(name, event);
        }
      }
    }
  }

  /** Performs the try bubble event operation. */
  override tryBubbleEvent(name: string, args: unknown[]): void {
    if (args.length === 1) {
      const event = args[0];
      if (
        event instanceof EventEmitterBubblingEvent &&
        !event.isPropagationStopped &&
        this._isInitialised
      ) {
        /**
         * In some cases (e.g. if an element is created from a DragSource) it
         * doesn't have a parent and is not a child of GroundItem. If that's the case
         * propagate the bubbling event from the top level of the substree directly
         * to the layoutManager
         */
        if (!this.isGround && this._parent) {
          this._parent.emitUnknown(name, event);
        } else {
          this.scheduleEventPropagationToLayoutManager(name, event);
        }
      }
    }
  }

  /**
   * All raw events bubble up to the Ground element. Some events that
   * are propagated to - and emitted by - the layoutManager however are
   * only string-based, batched and sanitized to make them more usable
   *
   * @param name - The name of the event
   * @internal
   */
  private scheduleEventPropagationToLayoutManager(
    name: string,
    event: EventEmitterBubblingEvent,
  ) {
    if (this._throttledEvents.indexOf(name) === -1) {
      this.layoutManager.emitUnknown(name, event);
    } else {
      if (this._pendingEventPropagations[name] !== true) {
        this._pendingEventPropagations[name] = true;
        this._pendingEventPropagationFrames[name] =
          globalThis.requestAnimationFrame(() =>
            this.propagateEventToLayoutManager(name, event),
          );
      }
    }
  }

  /**
   * Callback for events scheduled by _scheduleEventPropagationToLayoutManager
   *
   * @param name - The name of the event
   * @internal
   */
  private propagateEventToLayoutManager(
    name: string,
    event: EventEmitterBubblingEvent,
  ) {
    this._pendingEventPropagations[name] = false;
    this._pendingEventPropagationFrames[name] = undefined;
    if (!this._isDestroyed && !this.layoutManager.isDestroyed) {
      this.layoutManager.emitUnknown(name, event);
    }
  }

  private getItemsByFilter(
    predicate: (item: ContentItem) => boolean,
  ): ContentItem[] {
    const result: ContentItem[] = [];
    this.addItemsByFilterToArray(result, predicate);
    return result;
  }

  private addItemsByFilterToArray(
    result: ContentItem[],
    predicate: (item: ContentItem) => boolean,
  ): void {
    if (predicate(this)) {
      result.push(this);
    }

    const contentItems = this._contentItems;
    for (let i = 0; i < contentItems.length; i++) {
      contentItems[i].addItemsByFilterToArray(result, predicate);
    }
  }
}

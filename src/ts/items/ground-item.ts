import {
  type ComponentItemConfig,
  type RowOrColumnItemConfig,
  type StackItemConfig,
  resolveItemConfigWithComponentReorderEnabledDefault,
} from '../config/config';
import {
  type ResolvedComponentItemConfig,
  createResolvedHeaderedItemConfigHeaderCopy,
  type ResolvedItemConfig,
  type ResolvedRootItemConfig,
  createResolvedGroundItemConfig,
  createResolvedItemConfigDefault,
  createResolvedStackItemConfigDefault,
  isResolvedRootItemConfig,
} from '../config/resolved-config';
import { AssertError, UnexpectedNullError } from '../errors/internal-error';
import { LayoutManager } from '../layout-manager';
import { DomConstants } from '../utils/dom-constants';
import { AreaLinkedRect, ItemType, SizeUnit } from '../utils/types';
import {
  getElementWidthAndHeight,
  setElementHeight,
  setElementWidth,
} from '../utils/utils';
import { ComponentItem } from './component-item';
import { ComponentParentableItem } from './component-parentable-item';
import { ContentItem, type ContentItemArea } from './content-item';
import { RowOrColumn } from './row-or-column';

export interface GroundItemArea extends ContentItemArea {
  side: keyof typeof GroundItemAreaSide;
}

export const enum GroundItemAreaSide {
  y2,
  x2,
  y1,
  x1,
}

export type GroundItemAreaSides = {
  [side in keyof typeof GroundItemAreaSide]: keyof typeof GroundItemAreaSide;
};

export const groundItemAreaOppositeSides: GroundItemAreaSides = {
  y2: 'y1',
  x2: 'x1',
  y1: 'y2',
  x1: 'x2',
};

export function createGroundItemElement(document: Document): HTMLDivElement {
  const element = document.createElement('div');
  element.classList.add(DomConstants.ClassName.LayoutRoot);
  element.classList.add(DomConstants.ClassName.Item);
  element.classList.add(DomConstants.ClassName.Root);
  return element;
}

/**
 * GroundItem is the ContentItem whose one child is the root ContentItem (Root is planted in Ground).
 * (Previously it was called root however this was incorrect as its child is the root item)
 * There is only one instance of GroundItem and it is automatically created by the Layout Manager
 * @internal
 */
export class GroundItem extends ComponentParentableItem {
  private readonly _childElementContainer: HTMLElement;
  private readonly _containerElement: HTMLElement;

  constructor(
    layoutManager: LayoutManager,
    rootItemConfig: ResolvedRootItemConfig | undefined,
    containerElement: HTMLElement,
  ) {
    super(
      layoutManager,
      createResolvedGroundItemConfig(rootItemConfig),
      null,
      createGroundItemElement(document),
    );

    this.isGround = true;
    this._childElementContainer = this.element;
    this._containerElement = containerElement;

    // insert before any pre-existing content elements
    let before = null;
    while (true) {
      const prev: ChildNode | null = before
        ? before.previousSibling
        : this._containerElement.lastChild;
      if (
        prev instanceof Element &&
        prev.classList.contains(DomConstants.ClassName.Content)
      ) {
        before = prev;
      } else {
        break;
      }
    }
    this._containerElement.insertBefore(this.element, before);
  }

  override init(): void {
    if (this.isInitialised) return;

    this.updateNodeSize();

    for (let i = 0; i < this.contentItems.length; i++) {
      this._childElementContainer.appendChild(this.contentItems[i].element);
    }

    super.init();

    this.initContentItems();
  }

  /**
   * Loads a new Layout
   * Internal only. To load a new layout with API, use {@link LayoutManager.loadLayout}
   */
  loadRoot(rootItemConfig: ResolvedRootItemConfig | undefined): void {
    if (rootItemConfig === undefined) {
      this.clearRoot();
      return;
    }

    const rootContentItem = this.layoutManager.createAndInitContentItem(
      rootItemConfig,
      this,
    );
    const previousRoot = this.contentItems[0];
    if (previousRoot !== undefined) {
      super.removeChild(previousRoot, true);
    }
    try {
      this.addChild(rootContentItem, 0);
    } catch (error) {
      if (this.contentItems.includes(rootContentItem)) {
        super.removeChild(rootContentItem, true);
      }
      rootContentItem.destroy();
      if (previousRoot !== undefined) {
        // Restore structure without re-entering the failure-prone sizing path.
        super.addChild(previousRoot, 0, true);
      }
      throw error;
    }
    previousRoot?.destroy();
  }

  clearRoot(): void {
    // Remove existing root if it exists
    const contentItems = this.contentItems;
    switch (contentItems.length) {
      case 0: {
        return;
      }
      case 1: {
        const existingRootContentItem = contentItems[0];
        existingRootContentItem.remove();
        return;
      }
      default: {
        throw new AssertError('GILR07721');
      }
    }
  }

  /**
   * Adds a ContentItem child to root ContentItem.
   * Internal only. To add via the public API, use {@link LayoutManager.addItem}
   * @returns -1 if added as root otherwise index in root ContentItem's content
   */
  addItem(
    itemConfig: RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig,
    index?: number,
  ): number {
    this.layoutManager.checkMinimiseMaximisedStack();

    const resolvedItemConfig =
      resolveItemConfigWithComponentReorderEnabledDefault(
        itemConfig,
        this.layoutManager.layoutConfig.settings.reorderEnabled,
      );
    let parent: ContentItem;
    if (this.contentItems.length > 0) {
      parent = this.contentItems[0];
    } else {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      parent = this;
    }
    if (parent.isComponent) {
      throw new Error('Cannot add item as child to ComponentItem');
    } else {
      const contentItem = this.layoutManager.createAndInitContentItem(
        resolvedItemConfig,
        parent,
      );
      index = parent.addChild(contentItem, index);
      return parent === this ? -1 : index;
    }
  }

  loadComponentAsRoot(itemConfig: ComponentItemConfig): void {
    const resolvedItemConfig =
      resolveItemConfigWithComponentReorderEnabledDefault(
        itemConfig,
        this.layoutManager.layoutConfig.settings.reorderEnabled,
      ) as ResolvedComponentItemConfig;

    if (resolvedItemConfig.maximised) {
      throw new Error('Root Component cannot be maximised');
    } else {
      const rootContentItem = new ComponentItem(
        this.layoutManager,
        resolvedItemConfig,
        this,
      );
      try {
        rootContentItem.init();
      } catch (error) {
        rootContentItem.destroy();
        throw error;
      }
      this.clearRoot();
      this.addChild(rootContentItem, 0);
    }
  }

  /**
   * Adds a Root ContentItem.
   * Internal only. To replace the root content item with API, use {@link LayoutManager.loadLayout}
   */
  override addChild(contentItem: ContentItem, index?: number): number {
    if (this.contentItems.length > 0) {
      throw new Error('Ground node can only have a single child');
    } else {
      // contentItem = this.layoutManager._$normalizeContentItem(contentItem, this);
      this._childElementContainer.appendChild(contentItem.element);
      index = super.addChild(contentItem, index);

      this.updateSize(false);
      this.emitBaseBubblingEvent('stateChanged');

      return index;
    }
  }

  /** @internal */
  override calculateConfigContent(): ResolvedRootItemConfig[] {
    const contentItems = this.contentItems;
    const count = contentItems.length;
    const result = Array<ResolvedRootItemConfig>(count);
    for (let i = 0; i < count; i++) {
      const item = contentItems[i];
      const itemConfig = item.toConfig();
      if (isResolvedRootItemConfig(itemConfig)) {
        result[i] = itemConfig;
      } else {
        throw new AssertError('RCCC66832');
      }
    }
    return result;
  }

  /** @internal */
  setSize(width: number, height: number): void {
    if (width === undefined || height === undefined) {
      this.updateSize(false);
    } else {
      setElementWidth(this.element, width);
      setElementHeight(this.element, height);

      // GroundItem can be empty
      if (this.contentItems.length > 0) {
        setElementWidth(this.contentItems[0].element, width);
        setElementHeight(this.contentItems[0].element, height);
      }

      this.updateContentItemsSize(false);
    }
  }

  /**
   * Adds a Root ContentItem.
   * Internal only. To replace the root content item with API, use {@link LayoutManager.updateRootSize}
   */
  override updateSize(force: boolean): void {
    this.layoutManager.beginVirtualSizedContainerAdding();
    try {
      this.updateNodeSize();
      this.updateContentItemsSize(force);
    } finally {
      this.layoutManager.endVirtualSizedContainerAdding();
    }
  }

  createSideAreas(): GroundItemArea[] {
    const areaSize = 50;

    const oppositeSides = groundItemAreaOppositeSides;
    const result = Array<GroundItemArea>(Object.keys(oppositeSides).length);
    let idx = 0;

    for (const key in oppositeSides) {
      const side = key as keyof GroundItemAreaSides;
      const area = this.getElementArea() as GroundItemArea;
      if (area === null) {
        throw new UnexpectedNullError('RCSA77553');
      } else {
        area.side = side;
        if (oppositeSides[side][1] === '2')
          area[side] = area[oppositeSides[side]] - areaSize;
        else area[side] = area[oppositeSides[side]] + areaSize;
        area.surface = (area.x2 - area.x1) * (area.y2 - area.y1);
        result[idx++] = area;
      }
    }

    return result;
  }

  override highlightDropZone(x: number, y: number, area: AreaLinkedRect): void {
    this.layoutManager.tabDropPlaceholder.remove();
    super.highlightDropZone(x, y, area);
  }

  override onDrop(contentItem: ContentItem, area: GroundItemArea): void {
    if (contentItem.isComponent) {
      const itemConfig = createResolvedStackItemConfigDefault();
      // since ResolvedItemConfig.contentItems not set up, we need to add header from Component
      const component = contentItem as ComponentItem;
      itemConfig.header = createResolvedHeaderedItemConfigHeaderCopy(
        component.headerConfig,
      );
      const stack = this.layoutManager.createAndInitContentItem(
        itemConfig,
        this,
      );
      stack.addChild(contentItem);
      contentItem = stack;
    }

    if (this.contentItems.length === 0) {
      this.addChild(contentItem);
    } else {
      const type = area.side[0] == 'x' ? ItemType.row : ItemType.column;
      const insertBefore = area.side[1] == '2';
      const column = this.contentItems[0];
      if (!(column instanceof RowOrColumn) || column.type !== type) {
        const itemConfig = createResolvedItemConfigDefault(type);
        const rowOrColumn = this.layoutManager.createContentItem(
          itemConfig,
          this,
        );
        this.replaceChild(column, rowOrColumn);
        rowOrColumn.addChild(contentItem, insertBefore ? 0 : undefined, true);
        rowOrColumn.addChild(column, insertBefore ? undefined : 0, true);
        column.size = 50;
        contentItem.size = 50;
        contentItem.sizeUnit = SizeUnit.Percent;
        rowOrColumn.updateSize(false);
      } else {
        if (column.contentItems.length === 0) {
          column.addChild(contentItem, undefined, true);
          contentItem.size = 100;
          contentItem.sizeUnit = SizeUnit.Percent;
          column.updateSize(false);
          return;
        }
        const sibling =
          column.contentItems[
            insertBefore ? 0 : column.contentItems.length - 1
          ];
        column.addChild(contentItem, insertBefore ? 0 : undefined, true);
        sibling.size *= 0.5;
        contentItem.size = sibling.size;
        contentItem.sizeUnit = SizeUnit.Percent;
        column.updateSize(false);
      }
    }
  }

  // No ContentItem can dock with groundItem.  However Stack can have a GroundItem parent and Stack requires that
  // its parent implement dock() function.  Accordingly this function is implemented but throws an exception as it should
  // never be called
  dock(): void {
    throw new AssertError('GID87731');
  }

  // No ContentItem can dock with groundItem.  However Stack can have a GroundItem parent and Stack requires that
  // its parent implement validateDocking() function.  Accordingly this function is implemented but throws an exception as it should
  // never be called
  validateDocking(): void {
    throw new AssertError('GIVD87732');
  }

  getAllContentItems(): ContentItem[] {
    const result: ContentItem[] = [this];
    this.deepGetAllContentItems(this.contentItems, result);
    return result;
  }

  getConfigMaximisedItems(): ContentItem[] {
    const result: ContentItem[] = [];
    this.deepFilterContentItems(this.contentItems, result, (item) => {
      if (ContentItem.isStack(item) && item.initialWantMaximise) {
        return true;
      } else {
        if (ContentItem.isComponentItem(item) && item.initialWantMaximise) {
          return true;
        } else {
          return false;
        }
      }
    });

    return result;
  }

  getItemsByPopInParentId(popInParentId: string): ContentItem[] {
    const result: ContentItem[] = [];
    this.deepFilterContentItems(this.contentItems, result, (item) =>
      item.popInParentIds.includes(popInParentId),
    );
    return result;
  }

  toConfig(): ResolvedItemConfig {
    throw new Error('Cannot generate GroundItem config');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setActiveComponentItem(
    item: ComponentItem,
    _focus: boolean,
    suppressFocusEvent: boolean,
  ): void {
    this.layoutManager.setFocusedComponentItem(item, suppressFocusEvent);
  }

  private updateNodeSize(): void {
    const { width, height } = getElementWidthAndHeight(this._containerElement);

    setElementWidth(this.element, width);
    setElementHeight(this.element, height);

    /*
     * GroundItem can be empty
     */
    if (this.contentItems.length > 0) {
      setElementWidth(this.contentItems[0].element, width);
      setElementHeight(this.contentItems[0].element, height);
    }
  }

  private deepGetAllContentItems(
    content: readonly ContentItem[],
    result: ContentItem[],
  ): void {
    for (let i = 0; i < content.length; i++) {
      const contentItem = content[i];
      result.push(contentItem);
      this.deepGetAllContentItems(contentItem.contentItems, result);
    }
  }

  private deepFilterContentItems(
    content: readonly ContentItem[],
    result: ContentItem[],
    checkAcceptFtn: (this: void, item: ContentItem) => boolean,
  ): void {
    for (let i = 0; i < content.length; i++) {
      const contentItem = content[i];
      if (checkAcceptFtn(contentItem)) {
        result.push(contentItem);
      }
      this.deepFilterContentItems(
        contentItem.contentItems,
        result,
        checkAcceptFtn,
      );
    }
  }
}

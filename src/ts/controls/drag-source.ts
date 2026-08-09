import {
  type ComponentItemConfig,
  resolveItemConfigWithComponentReorderEnabledDefault,
} from '../config/config';
import {
  createResolvedRowOrColumnItemConfigDefault,
  type ResolvedComponentItemConfig,
} from '../config/resolved-config';
import { UnexpectedNullError } from '../errors/internal-error';
import { ComponentItem } from '../items/component-item';
import { GroundItem } from '../items/ground-item';
import { LayoutManager } from '../layout-manager';
import { DragListener } from '../utils/drag-listener';

/**
 * Allows for any DOM item to create a component on drag
 * start to be dragged into the Layout
 * @public
 */
export class DragSource {
  /** @internal */
  private _dragListener: DragListener | null;
  /** @internal */
  private _dummyGroundContainer: HTMLElement;
  /** @internal */
  private _dummyGroundContentItem: GroundItem;
  /** @internal */
  private _isDestroying = false;

  /** @internal */
  constructor(
    /** @internal */
    private _layoutManager: LayoutManager,
    /** @internal */
    private readonly _element: HTMLElement,
    /** @internal */
    private readonly _extraAllowableChildTargets: HTMLElement[],
    private readonly _itemConfigCallback: () => ComponentItemConfig,
  ) {
    this._dragListener = null;

    this._dummyGroundContainer = document.createElement('div');

    const dummyRootItemConfig =
      createResolvedRowOrColumnItemConfigDefault('row');
    this._dummyGroundContentItem = new GroundItem(
      this._layoutManager,
      dummyRootItemConfig,
      this._dummyGroundContainer,
    );

    this.createDragListener();
  }

  /**
   * Disposes of the drag listeners so the drag source is not usable any more.
   * @internal
   */
  destroy(): void {
    this._isDestroying = true;
    this.removeDragListener();
    this._dummyGroundContentItem.destroy();
  }

  /**
   * Called initially and after every drag
   * @internal
   */
  private createDragListener() {
    this.removeDragListener();

    this._dragListener = new DragListener(
      this._element,
      this._extraAllowableChildTargets,
    );
    this._dragListener.on('dragStart', (x, y) => this.onDragStart(x, y));
    this._dragListener.on('dragStop', () => this.onDragStop());
  }

  /**
   * Callback for the DragListener's dragStart event
   *
   * @param x - The x position of the mouse on dragStart
   * @param y - The x position of the mouse on dragStart
   * @internal
   */
  private onDragStart(x: number, y: number) {
    const dragSourceItemConfig = this._itemConfigCallback();

    // Create a dummy ContentItem only for drag purposes
    // All ContentItems (except for GroundItem) need a parent.  When dragging, the parent is not used.
    // Instead of allowing null parents (as Javascript version did), use a temporary dummy GroundItem parent and add ContentItem to that
    // If this does not work, need to create alternative GroundItem class

    const resolvedItemConfig =
      resolveItemConfigWithComponentReorderEnabledDefault(
        dragSourceItemConfig,
        this._layoutManager.layoutConfig.settings.reorderEnabled,
      ) as ResolvedComponentItemConfig;

    const componentItem = new ComponentItem(
      this._layoutManager,
      resolvedItemConfig,
      this._dummyGroundContentItem,
    );
    this._dummyGroundContentItem.contentItems.push(componentItem);

    if (this._dragListener === null) {
      throw new UnexpectedNullError('DSODSD66746');
    } else {
      const dragProxyElement = this._layoutManager.startComponentDrag(
        x,
        y,
        this._dragListener,
        componentItem,
        this._dummyGroundContentItem,
      );

      const transitionIndicator = this._layoutManager.transitionIndicator;
      if (transitionIndicator === null) {
        throw new UnexpectedNullError('DSODST66746');
      } else {
        transitionIndicator.transitionElements(this._element, dragProxyElement);
      }
    }
  }

  /** @internal */
  private onDragStop() {
    // if (this._dummyGroundContentItem === undefined) {
    //     throw new UnexpectedUndefinedError('DSODSDRU08116');
    // } else {
    //     this._dummyGroundContentItem._$destroy
    //     this._dummyGroundContentItem = undefined;
    // }
    if (!this._isDestroying) {
      this.createDragListener();
    }
  }

  /**
   * Called after every drag and when the drag source is being disposed of.
   * @internal
   */
  private removeDragListener() {
    if (this._dragListener !== null) {
      this._dragListener.destroy();
      this._dragListener = null;
    }
  }
}

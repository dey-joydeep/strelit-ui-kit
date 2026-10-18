import {
  createResolvedLayoutConfigCopy,
  createResolvedPopoutLayoutConfigCopy,
  createResolvedRowOrColumnItemConfigDefault,
  minifyResolvedLayoutConfig,
  type ResolvedPopoutLayoutConfig,
  type ResolvedPopoutLayoutConfigWindow,
  type ResolvedRootItemConfig,
} from '../config/resolved-config';
import { PopoutBlockedError } from '../errors/external-error';
import {
  UnexpectedNullError,
  UnexpectedUndefinedError,
} from '../errors/internal-error';
import { ContentItem } from '../items/content-item';
import { GroundItem } from '../items/ground-item';
import { RowOrColumn } from '../items/row-or-column';
import { LayoutManager } from '../layout-manager';
import { EventEmitter } from '../utils/event-emitter';
import { ItemType, Rect, SizeUnit } from '../utils/types';
import { getErrorMessage, getUniqueId } from '../utils/utils';

/** Preserves a pop-in failure while surfacing cleanup failures as well. */
function throwWithPopInCleanupErrors(
  error: unknown,
  cleanupErrors: unknown[],
): never {
  if (cleanupErrors.length === 0) {
    throw error;
  }
  const primaryError =
    error instanceof Error ? error : new Error(String(error));
  throw Object.assign(primaryError, {
    errors: [error, ...cleanupErrors],
  });
}

/**
 * Pops a content item out into a new browser window.
 * This is achieved by
 *
 *    - Creating a new configuration with the content item as root element
 *    - Serializing and minifying the configuration
 *    - Opening the current window's URL with the configuration as a GET parameter
 *    - StrelitLayout when opened in the new window will look for the GET parameter
 *      and use it instead of the provided configuration
 * @public
 */

export class BrowserPopout extends EventEmitter {
  /** @internal */
  private _popoutWindow: Window | null;
  /** @internal */
  private _isInitialised: boolean;
  /** Child layout instance to which the pop-in listener is currently bound. */
  private _initialisedStrelitInstance: LayoutManager | undefined;
  /** Listener bound to the current child layout's pop-in event. */
  private _popInListener: (() => void) | undefined;
  /** @internal */
  private readonly _loadListener = () => this.positionWindow();
  /** @internal */
  private readonly _beforeUnloadListener = () => this._onClose();
  /** Cleans persisted popout state without retaining the owning layout. */
  private _storageCleanupListener: (() => void) | undefined;
  /** @internal */
  private _checkReadyInterval: ReturnType<typeof setTimeout> | undefined;
  /** @internal */
  private _isClosingOrPoppingIn = false;
  /** Whether an explicit close, rather than pop-in, initiated reconciliation. */
  private _closeRequested = false;
  /** @internal */
  private _closeEventScheduled = false;
  /** Closed child retained because automatic pop-in could not reconstruct it. */
  private _closedWithFailedPopIn = false;
  /** Rolls back content inserted while child-window closure is unconfirmed. */
  private _pendingPopInRollback: (() => void) | undefined;
  /** @internal */
  private _storageKey: string | undefined;
  /** Original share of the item in its parent row or column. */
  private _returnSize: number | undefined;
  private readonly _returnSizeUnit: SizeUnit | undefined;
  private _returnedToParent = false;
  private _returnedContentItem: ContentItem | undefined;
  private _returnMarkerAbandoned = false;
  private _closedFinalised = false;

  /** @internal */
  get returnParentId(): string | null | undefined {
    return this._returnMarkerAbandoned ? null : this._config.parentId;
  }

  /** @internal */
  get pendingReturnPercent(): number | undefined {
    return !this.hasReturnedToParent &&
      !this._returnMarkerAbandoned &&
      this._returnSizeUnit === SizeUnit.Percent
      ? this._returnSize
      : undefined;
  }

  /** @internal */
  get pendingReturnIndex(): number | undefined {
    const index = this._config.indexInParent;
    return !this.hasReturnedToParent &&
      !this._returnMarkerAbandoned &&
      index !== null
      ? index
      : undefined;
  }

  /** @internal */
  abandonReturnMarker(): void {
    this._returnMarkerAbandoned = true;
  }

  /** @internal */
  get returnMarkerAbandoned(): boolean {
    return this._returnMarkerAbandoned;
  }

  /** @internal */
  get isRestoringToParent(): boolean {
    return (
      this._isClosingOrPoppingIn &&
      !this._closeRequested &&
      !this._closedFinalised
    );
  }

  /** @internal */
  get hasReturnedToParent(): boolean {
    const groundItem = this._layoutManager.groundItem;
    const returnedItem = this._returnedContentItem;
    if (
      !this._returnedToParent ||
      groundItem === undefined ||
      returnedItem === undefined
    ) {
      return false;
    }
    let item: ContentItem = returnedItem;
    while (item !== groundItem) {
      const parent: ContentItem | null = item.parent;
      if (parent === null || !parent.contentItems.includes(item)) {
        return false;
      }
      item = parent;
    }
    return true;
  }

  /** @internal */
  reconcileClosedWindowNow(): void {
    if (
      !this._closedFinalised &&
      !this._closedWithFailedPopIn &&
      !this._isClosingOrPoppingIn &&
      this._popoutWindow?.closed
    ) {
      this.reconcileCloseEvent();
    }
  }

  /** @internal */
  rebaseReturnAfterDiscard(
    discardedIndex: number,
    discardedPercent: number | undefined,
  ): void {
    const index = this.pendingReturnIndex;
    if (index === undefined) {
      return;
    }
    if (
      this._returnSizeUnit === SizeUnit.Percent &&
      this._returnSize !== undefined &&
      discardedPercent !== undefined &&
      discardedPercent > 0 &&
      discardedPercent < 100
    ) {
      this._returnSize = Math.min(
        100,
        (this._returnSize * 100) / (100 - discardedPercent),
      );
    }
    this._config = createResolvedPopoutLayoutConfigCopy({
      ...this._config,
      root: this.withReturnSize(this._config.root),
      indexInParent: index > discardedIndex ? index - 1 : index,
    });
  }

  /**
   * @param _config - StrelitLayout item config
   * @param _initialWindowSize - A map with width, height, top and left
   * @internal
   */
  /** Prevents unsupported direct construction. @public */
  constructor(_nonConstructible: never, ..._args: never[]);
  /** @internal */
  constructor(
    config: ResolvedPopoutLayoutConfig,
    initialWindowSize: Rect,
    layoutManager: LayoutManager,
  );
  constructor(
    /** @internal */
    private _config: ResolvedPopoutLayoutConfig,
    /** @internal */
    private _initialWindowSize: Rect,
    /** @internal */
    private _layoutManager: LayoutManager,
  ) {
    super();

    Object.defineProperty(
      this,
      Symbol.for('strelit-ui-kit.event-dispatch-guard'),
      {
        value: (eventName: string) =>
          !this._layoutManager.isDestroyed ||
          (eventName !== 'initialised' && eventName !== 'closed'),
      },
    );
    this._isInitialised = false;
    this._popoutWindow = null;
    this._returnSize = this._config.root?.size;
    this._returnSizeUnit = this._config.root?.sizeUnit;
    this.createWindow();
  }

  /** @internal */
  get closedWithFailedPopIn(): boolean {
    return this._closedWithFailedPopIn;
  }

  /** Releases parent-owned listeners and polling without closing the child window. */
  /** @internal */
  destroy(): void {
    this.clearCheckReadyInterval();
    try {
      this.unbindPopInListener();
    } catch (error) {
      this.reportAsynchronousError(error);
    }
    this._pendingPopInRollback = undefined;
    if (this._popoutWindow !== null) {
      try {
        this._popoutWindow.removeEventListener('load', this._loadListener);
        this._popoutWindow.removeEventListener(
          'beforeunload',
          this._beforeUnloadListener,
        );
        if (this._storageKey !== undefined && !this._popoutWindow.closed) {
          const storageCleanupListener = this._storageCleanupListener;
          if (storageCleanupListener !== undefined) {
            this._popoutWindow.removeEventListener(
              'beforeunload',
              storageCleanupListener,
            );
            this._popoutWindow.addEventListener(
              'beforeunload',
              storageCleanupListener,
              { passive: true },
            );
            storageCleanupListener();
          }
        } else if (this._storageCleanupListener !== undefined) {
          this._popoutWindow.removeEventListener(
            'beforeunload',
            this._storageCleanupListener,
          );
        }
      } catch {
        // Cross-origin children may reject listener access during disposal.
      }
    }
  }

  /** Performs the to config operation. */
  toConfig(): ResolvedPopoutLayoutConfig {
    if (this._closedWithFailedPopIn) {
      return createResolvedPopoutLayoutConfigCopy(this._config);
    }
    let strelitInstance: LayoutManager | undefined;
    try {
      strelitInstance = this.tryGetStrelitInstance();
    } catch (error) {
      if (isCrossOriginAccessError(error)) {
        return createResolvedPopoutLayoutConfigCopy(this._config);
      }
      throw error;
    }
    if (!this._isInitialised || strelitInstance === undefined) {
      return createResolvedPopoutLayoutConfigCopy(this._config);
    }

    const strelitInstanceConfig = strelitInstance.saveLayout();

    let left: number | null;
    let top: number | null;
    if (this._popoutWindow === null) {
      left = null;
      top = null;
    } else {
      left = this._popoutWindow.screenX ?? this._popoutWindow.screenLeft;
      top = this._popoutWindow.screenY ?? this._popoutWindow.screenTop;
    }

    const window: ResolvedPopoutLayoutConfigWindow = {
      width: strelitInstance.width,
      height: strelitInstance.height,
      left,
      top,
    };

    const config: ResolvedPopoutLayoutConfig = {
      root: this.withReturnSize(strelitInstanceConfig.root),
      openPopouts: strelitInstanceConfig.openPopouts,
      settings: strelitInstanceConfig.settings,
      dimensions: strelitInstanceConfig.dimensions,
      header: strelitInstanceConfig.header,
      window,
      parentId: this._config.parentId,
      indexInParent: this._config.indexInParent,
      resolved: true,
    };

    this._config = createResolvedPopoutLayoutConfigCopy(config);
    return config;
  }

  /** Returns strelit instance. */
  getStrelitInstance(): LayoutManager {
    if (this._popoutWindow === null) {
      throw new UnexpectedNullError('BPGGI24693');
    }
    const strelitInstance = this._popoutWindow.__strelitInstance;
    if (strelitInstance === undefined) {
      throw new UnexpectedUndefinedError('BPGGI24694');
    }
    return strelitInstance;
  }

  /**
   * Retrieves the native BrowserWindow backing this popout.
   * Might throw an UnexpectedNullError exception when the window is not initialized yet.
   * @public
   */
  getWindow(): Window {
    if (this._popoutWindow === null) {
      throw new UnexpectedNullError('BPGW087215');
    }
    return this._popoutWindow;
  }

  /** Performs the close operation. */
  close(): void {
    if (this._popoutWindow === null || this._isClosingOrPoppingIn) {
      return;
    }
    this._closeRequested = true;
    this._isClosingOrPoppingIn = true;
    let strelitInstance: LayoutManager | undefined;
    try {
      strelitInstance = this.tryGetStrelitInstance();
    } catch (error) {
      this._closeRequested = false;
      this._isClosingOrPoppingIn = false;
      throw error;
    }
    if (strelitInstance !== undefined) {
      try {
        strelitInstance.closeWindow();
      } catch {
        try {
          this.getWindow().close();
        } catch {
          //
        }
      }
    } else {
      try {
        this.getWindow().close();
      } catch {
        //
      }
    }
    this._onClose();
  }

  /**
   * Returns the popped out item to its original position. If the original
   * parent isn't available anymore it falls back to the layout's topmost element
   */
  popIn(): void {
    if (this._isClosingOrPoppingIn || this._returnMarkerAbandoned) {
      return;
    }
    this._closeRequested = false;
    this.rollbackPendingPopIn();
    this._isClosingOrPoppingIn = true;
    try {
      this._pendingPopInRollback = this.popInInternal();
      this._closedWithFailedPopIn = false;
    } catch (error) {
      this._isClosingOrPoppingIn = false;
      throw error;
    }
    try {
      if (this._popoutWindow !== null) {
        const strelitInstance = this.tryGetStrelitInstance();
        if (strelitInstance !== undefined) {
          strelitInstance.closeWindow();
        } else {
          try {
            this.getWindow().close();
          } catch {
            // Closure is confirmed below; a still-open window rolls back.
          }
        }
      }
    } finally {
      // A close request can throw after scheduling or completing closure.
      // Reconcile against Window.closed before committing or rolling back.
      this._onClose();
    }
  }

  private popInInternal(): (() => void) | undefined {
    if (this._returnMarkerAbandoned) {
      return undefined;
    }
    let parentItem: ContentItem | undefined;
    let index =
      this._config.indexInParent === null
        ? undefined
        : this._config.indexInParent;

    if (this._config.parentId === undefined) {
      return undefined;
    }

    const strelitInstance = this._closedWithFailedPopIn
      ? undefined
      : (this._popoutWindow?.__strelitInstance ?? undefined);
    const strelitInstanceLayoutConfig =
      strelitInstance !== undefined
        ? strelitInstance.saveLayout()
        : this._config;
    const copiedStrelitLayoutConfig = createResolvedLayoutConfigCopy(
      strelitInstanceLayoutConfig,
    );
    const copiedRoot = this.withReturnSize(copiedStrelitLayoutConfig.root);
    this._config = createResolvedPopoutLayoutConfigCopy({
      ...copiedStrelitLayoutConfig,
      root: copiedRoot,
      window: this._config.window,
      parentId: this._config.parentId,
      indexInParent: this._config.indexInParent,
      resolved: true,
    });
    if (copiedRoot === undefined) {
      return undefined;
    }
    const groundItem = this._layoutManager.groundItem;
    if (groundItem === undefined) {
      throw new UnexpectedUndefinedError('BPPIG34972');
    }
    if (this._config.parentId !== null) {
      parentItem = groundItem.getItemsByPopInParentId(this._config.parentId)[0];
    }
    const originalParentFound = parentItem !== undefined;
    if (!this._isInitialised && parentItem !== undefined) {
      // A source-item popout remains attached until the child initializes.
      return undefined;
    }

    /*
     * Fallback if parentItem is not available. Either add it to the topmost
     * item or make it the topmost item if the layout is empty
     */
    const destination = this.findPopInDestination(
      groundItem,
      copiedRoot,
      parentItem,
      index,
    );
    parentItem = destination.parentItem;
    index = destination.index;
    if (
      originalParentFound &&
      parentItem instanceof RowOrColumn &&
      index !== undefined
    ) {
      index = this._layoutManager.getCurrentReturnIndex(
        parentItem,
        index,
        this,
      );
    }
    const { rootItemToWrap, wrapperItem } = destination;

    const newContentItem = this.createPopInContentItem(
      copiedRoot,
      parentItem,
      wrapperItem,
    );

    if (rootItemToWrap !== undefined && wrapperItem !== undefined) {
      return this.insertWrappedPopInItem(
        groundItem,
        rootItemToWrap,
        wrapperItem,
        newContentItem,
      );
    }

    return this.insertDirectPopInItem(
      parentItem,
      newContentItem,
      index,
      originalParentFound ? this._returnSize : undefined,
    );
  }

  private withReturnSize(
    root: ResolvedRootItemConfig | undefined,
  ): ResolvedRootItemConfig | undefined {
    if (
      root === undefined ||
      this._returnSize === undefined ||
      this._returnSizeUnit === undefined
    ) {
      return root;
    }
    return {
      ...root,
      size: this._returnSize,
      sizeUnit: this._returnSizeUnit,
    };
  }

  private createPopInContentItem(
    copiedRoot: ResolvedRootItemConfig,
    parentItem: ContentItem,
    wrapperItem: ContentItem | undefined,
  ): ContentItem {
    try {
      return this._layoutManager.createAndInitContentItem(
        copiedRoot,
        parentItem,
      );
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      if (wrapperItem !== undefined) {
        try {
          wrapperItem.destroy();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      throwWithPopInCleanupErrors(error, cleanupErrors);
    }
  }

  private findPopInDestination(
    groundItem: GroundItem,
    copiedRoot: ResolvedRootItemConfig,
    parentItem: ContentItem | undefined,
    index: number | undefined,
  ): {
    parentItem: ContentItem;
    index: number | undefined;
    rootItemToWrap?: ContentItem;
    wrapperItem?: ContentItem;
  } {
    if (parentItem !== undefined) {
      return { parentItem, index };
    }
    if (groundItem.contentItems.length === 0) {
      return { parentItem: groundItem, index: 0 };
    }
    const rootItem = groundItem.contentItems[0];
    const rootCanAcceptReturnedItem =
      rootItem.isRow ||
      rootItem.isColumn ||
      (rootItem.isStack && copiedRoot.type === ItemType.component);
    if (rootCanAcceptReturnedItem) {
      return { parentItem: rootItem, index: 0 };
    }
    const wrapperItem = this._layoutManager.createAndInitContentItem(
      createResolvedRowOrColumnItemConfigDefault('row'),
      groundItem,
    );
    return {
      parentItem: wrapperItem,
      index: 1,
      rootItemToWrap: rootItem,
      wrapperItem,
    };
  }

  private insertDirectPopInItem(
    parentItem: ContentItem,
    newContentItem: ContentItem,
    index: number | undefined,
    returnSize: number | undefined,
  ): () => void {
    try {
      if (index !== undefined) {
        const normalizedIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
        index = Math.max(
          0,
          Math.min(normalizedIndex, parentItem.contentItems.length),
        );
      }
      // addChild emits stateChanged; a synchronous save must see the inserted
      // item in the parent rather than a second copy in openPopouts.
      this._returnedContentItem = newContentItem;
      this._returnedToParent = true;
      parentItem.addChild(newContentItem, index);
      this.restoreDirectPopInSize(parentItem, newContentItem, returnSize);
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      if (parentItem.contentItems.includes(newContentItem)) {
        try {
          parentItem.removeChild(newContentItem, true);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (!parentItem.contentItems.includes(newContentItem)) {
        try {
          newContentItem.destroy();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      this._returnedToParent = parentItem.contentItems.includes(newContentItem);
      throwWithPopInCleanupErrors(error, cleanupErrors);
    }
    return () => {
      try {
        if (parentItem.contentItems.includes(newContentItem)) {
          newContentItem.remove();
        }
        this._returnedToParent = false;
      } catch (error) {
        this._returnedToParent =
          parentItem.contentItems.includes(newContentItem);
        throw error;
      }
    };
  }

  private restoreDirectPopInSize(
    parentItem: ContentItem,
    newContentItem: ContentItem,
    returnSize: number | undefined,
  ): void {
    if (
      !(parentItem instanceof RowOrColumn) ||
      this._returnSizeUnit !== SizeUnit.Percent ||
      returnSize === undefined ||
      returnSize <= 0
    ) {
      return;
    }
    const reservedSize = this._layoutManager.getReservedPopoutPercent(
      parentItem,
      this,
    );
    const availableSize = 100 - reservedSize;
    const normalizedReturnSize =
      availableSize > 0 ? (returnSize / availableSize) * 100 : 100;
    const siblings = parentItem.contentItems.filter(
      (item) => item !== newContentItem,
    );
    const siblingTotal = siblings.reduce((total, item) => total + item.size, 0);
    if (
      siblings.length === 0 ||
      siblingTotal <= 0 ||
      normalizedReturnSize >= 100
    ) {
      return;
    }
    const remainingSize = 100 - normalizedReturnSize;
    for (const sibling of siblings) {
      sibling.size = (sibling.size / siblingTotal) * remainingSize;
    }
    newContentItem.size = normalizedReturnSize;
    parentItem.updateSize(false);
  }

  private insertWrappedPopInItem(
    groundItem: GroundItem,
    rootItemToWrap: ContentItem,
    wrapperItem: ContentItem,
    newContentItem: ContentItem,
  ): () => void {
    try {
      wrapperItem.addChild(newContentItem, 0, true);
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      if (!wrapperItem.contentItems.includes(newContentItem)) {
        try {
          newContentItem.destroy();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      try {
        wrapperItem.destroy();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      throwWithPopInCleanupErrors(error, cleanupErrors);
    }

    try {
      wrapperItem.addChild(rootItemToWrap, 0, true);
      // Keep the old root savable while addChild emits stateChanged. It is
      // detached from ground only after the wrapper owns it.
      groundItem.removeChild(rootItemToWrap, true);
      // The ground insertion emits stateChanged. Both children must already
      // be present, and a nested save must not serialize the return twice.
      this._returnedContentItem = newContentItem;
      this._returnedToParent = true;
      groundItem.addChild(wrapperItem);
    } catch (error) {
      this.rollbackWrappedPopInInsertion(
        groundItem,
        rootItemToWrap,
        wrapperItem,
        error,
      );
    }
    return () => {
      try {
        if (wrapperItem.contentItems.includes(rootItemToWrap)) {
          wrapperItem.removeChild(rootItemToWrap, true);
        }
        if (groundItem.contentItems.includes(wrapperItem)) {
          groundItem.removeChild(wrapperItem, true);
        }
        this._returnedToParent = false;
        if (!groundItem.contentItems.includes(rootItemToWrap)) {
          groundItem.restoreRootWithoutResize(rootItemToWrap);
        }
        wrapperItem.destroy();
      } catch (error) {
        this._returnedToParent = groundItem.contentItems.includes(wrapperItem);
        throw error;
      }
    };
  }

  private rollbackWrappedPopInInsertion(
    groundItem: GroundItem,
    rootItemToWrap: ContentItem,
    wrapperItem: ContentItem,
    error: unknown,
  ): never {
    const rollbackErrors: unknown[] = [];
    if (wrapperItem.contentItems.includes(rootItemToWrap)) {
      try {
        wrapperItem.removeChild(rootItemToWrap, true);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (groundItem.contentItems.includes(wrapperItem)) {
      try {
        groundItem.removeChild(wrapperItem, true);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    this._returnedToParent = groundItem.contentItems.includes(wrapperItem);
    this.restoreWrappedPopInRoot(
      groundItem,
      rootItemToWrap,
      wrapperItem,
      rollbackErrors,
    );
    if (rollbackErrors.length > 0) {
      throw Object.assign(
        new Error('Pop-in insertion failed and root rollback was incomplete'),
        { errors: [error, ...rollbackErrors] },
      );
    }
    throw error;
  }

  private restoreWrappedPopInRoot(
    groundItem: GroundItem,
    rootItemToWrap: ContentItem,
    wrapperItem: ContentItem,
    rollbackErrors: unknown[],
  ): void {
    if (
      groundItem.contentItems.includes(rootItemToWrap) &&
      rootItemToWrap.parent !== groundItem
    ) {
      try {
        groundItem.removeChild(rootItemToWrap, true);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (
      !groundItem.contentItems.includes(rootItemToWrap) &&
      !wrapperItem.contentItems.includes(rootItemToWrap)
    ) {
      try {
        groundItem.restoreRootWithoutResize(rootItemToWrap);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (
      !groundItem.contentItems.includes(wrapperItem) &&
      !wrapperItem.contentItems.includes(rootItemToWrap)
    ) {
      try {
        wrapperItem.destroy();
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
  }

  /**
   * Creates the URL and window parameter
   * and opens a new window
   * @internal
   */
  private createWindow(): void {
    const { url, storageKey } = this.createUrl();
    this._storageKey = storageKey;
    let childWindow: Window | null = null;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    this._storageCleanupListener = () => {
      const windowToCheck = childWindow;
      if (windowToCheck === null || cleanupTimer !== undefined) return;
      const checkClosed = (): void => {
        cleanupTimer = undefined;
        if (!windowToCheck.closed) {
          cleanupTimer = setTimeout(checkClosed, 50);
          return;
        }
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // A detached cleanup listener cannot report through the destroyed layout.
        }
      };
      cleanupTimer = setTimeout(checkClosed, 50);
    };

    /**
     * Bogus title to prevent re-usage of existing window with the
     * same title. The actual title will be set by the new window's
     * StrelitLayout instance if it detects that it is in subWindowMode
     */
    const target = getUniqueId();

    /**
     * The options as used in the window.open string
     */
    const features = this.serializeWindowFeatures({
      width: this._initialWindowSize.width,
      height: this._initialWindowSize.height,
      innerWidth: this._initialWindowSize.width,
      innerHeight: this._initialWindowSize.height,
      menubar: 'no',
      toolbar: 'no',
      location: 'no',
      personalbar: 'no',
      resizable: 'yes',
      scrollbars: 'no',
      status: 'no',
    });

    this._popoutWindow = globalThis.open(url, target, features);
    childWindow = this._popoutWindow;

    if (!this._popoutWindow) {
      localStorage.removeItem(storageKey);
      if (
        this._layoutManager.layoutConfig.settings.blockedPopoutsThrowError ===
        true
      ) {
        const error = new PopoutBlockedError('Popout blocked');
        throw error;
      } else {
        return;
      }
    }

    this._popoutWindow.addEventListener('load', this._loadListener, {
      passive: true,
    });
    this._popoutWindow.addEventListener(
      'beforeunload',
      this._beforeUnloadListener,
      { passive: true },
    );

    /**
     * Polling the childwindow to find out if StrelitLayout has been initialised
     * doesn't seem optimal, but the alternatives - adding a callback to the parent
     * window or raising an event on the window object - both would introduce knowledge
     * about the parent to the child window which we'd rather avoid
     */
    this.startCheckReadyInterval(10);
  }

  /** @internal */
  private checkReady() {
    if (this._popoutWindow === null || this._layoutManager.isDestroyed) {
      this.clearCheckReadyInterval();
      return;
    }
    if (this._popoutWindow.closed) {
      this.clearCheckReadyInterval();
      this._onClose();
    } else if (this._pendingPopInRollback !== undefined) {
      try {
        this.rollbackPendingPopIn();
      } catch {
        // Keep the rollback handle and retry while the child remains open.
      }
    } else {
      this.checkReadyChildInstance(this._popoutWindow);
    }
  }

  private checkReadyChildInstance(popoutWindow: Window): void {
    let strelitInstance: LayoutManager | undefined;
    try {
      strelitInstance = popoutWindow.__strelitInstance;
    } catch {
      // A navigated child can become cross-origin. Keep polling closure.
      return;
    }
    if (
      strelitInstance?.isInitialised &&
      strelitInstance !== this._initialisedStrelitInstance
    ) {
      try {
        this.onInitialised(strelitInstance);
      } finally {
        this.clearCheckReadyInterval();
        // Browser chrome can close a window without dispatching beforeunload.
        if (
          !this._layoutManager.isDestroyed &&
          !this._closeEventScheduled &&
          !this._closedFinalised
        ) {
          this.startCheckReadyInterval(250);
        }
      }
    }
  }

  private startCheckReadyInterval(intervalMs: number): void {
    this.clearCheckReadyInterval();
    this._checkReadyInterval = setInterval(() => this.checkReady(), intervalMs);
  }

  private clearCheckReadyInterval() {
    if (this._checkReadyInterval !== undefined) {
      clearInterval(this._checkReadyInterval);
      this._checkReadyInterval = undefined;
    }
  }

  /**
   * Serialises a map of key:values to a window options string
   *
   * @param windowOptions -
   *
   * @returns serialised window options
   * @internal
   */
  private serializeWindowFeatures(
    windowOptions: Record<string, string | number>,
  ): string {
    const windowOptionsString: string[] = [];

    for (const key in windowOptions) {
      windowOptionsString.push(key + '=' + windowOptions[key].toString());
    }

    return windowOptionsString.join(',');
  }

  /**
   * Creates the URL for the new window, including the
   * config GET parameter
   *
   * @returns URL
   * @internal
   */
  private createUrl(): { url: string; storageKey: string } {
    const storageKey = 'strelit-window-config-' + getUniqueId();
    const config = minifyResolvedLayoutConfig(this._config);

    try {
      localStorage.setItem(storageKey, JSON.stringify(config));
    } catch (e) {
      throw new Error(
        'Error while writing to localStorage ' + getErrorMessage(e),
      );
    }

    const url = new URL(location.href);
    url.searchParams.set('strelit-window', storageKey);
    return { url: url.toString(), storageKey };
  }

  /**
   * Move the newly created window roughly to
   * where the component used to be.
   * @internal
   */
  private positionWindow() {
    if (this._popoutWindow === null) {
      throw new Error('BrowserPopout.positionWindow: null popoutWindow');
    } else {
      this._popoutWindow.moveTo(
        this._initialWindowSize.left,
        this._initialWindowSize.top,
      );
      this._popoutWindow.focus();
    }
  }

  /**
   * Callback when the new window is opened and the StrelitLayout instance
   * within it is initialised
   * @internal
   */
  private onInitialised(strelitInstance: LayoutManager): void {
    if (this._layoutManager.isDestroyed) {
      return;
    }
    const isFirstInitialisation = !this._isInitialised;
    this._isInitialised = true;
    try {
      this.unbindPopInListener();
    } catch (error) {
      this.reportAsynchronousError(error);
    }
    this._initialisedStrelitInstance = strelitInstance;
    this._popInListener = () => this.popIn();
    strelitInstance.on('popIn', this._popInListener);
    if (isFirstInitialisation) {
      this.emit('initialised');
    }
  }

  /**
   * Invoked 50ms after the window unload event
   * @internal
   */
  private _onClose() {
    if (this._closeEventScheduled || this._closedFinalised) {
      return;
    }
    this._closeEventScheduled = true;
    this.clearCheckReadyInterval();
    setTimeout(() => this.reconcileCloseEvent(), 50);
  }

  private reconcileCloseEvent(): void {
    if (this._closedFinalised) {
      return;
    }
    const windowClosed =
      this._popoutWindow === null || this._popoutWindow.closed;
    if (
      windowClosed &&
      !this._layoutManager.isDestroyed &&
      !this._isClosingOrPoppingIn &&
      !this._closeRequested &&
      !this._returnMarkerAbandoned &&
      this._layoutManager.layoutConfig.settings.popInOnClose
    ) {
      this._isClosingOrPoppingIn = true;
      try {
        this.popInInternal();
        this._closedWithFailedPopIn = false;
      } catch (error) {
        this._closedWithFailedPopIn = true;
        this._isClosingOrPoppingIn = false;
        this._closeEventScheduled = false;
        this.reportAsynchronousError(error);
        return;
      }
    }
    this._closeEventScheduled = false;
    if (windowClosed) {
      this.finishClosedWindow();
    } else {
      this.resumeOpenWindow();
    }
  }

  private resumeOpenWindow(): void {
    try {
      this.rollbackPendingPopIn();
    } catch {
      // Keep the rollback handle for the readiness interval to retry.
    }
    // beforeunload also fires for reloads and navigation. Resume detection
    // when reconciliation confirms that the window is still open.
    this._isClosingOrPoppingIn = false;
    if (!this._layoutManager.isDestroyed) {
      this.startCheckReadyInterval(this._isInitialised ? 250 : 10);
    }
  }

  private finishClosedWindow(): void {
    if (this._closedFinalised) {
      return;
    }
    this._closedFinalised = true;
    this._pendingPopInRollback = undefined;
    this._closeRequested = false;
    if (!this._layoutManager.isDestroyed) {
      try {
        this.clearReturnMarker();
      } catch (error) {
        this.reportAsynchronousError(error);
      }
    }
    try {
      this.unbindPopInListener();
    } catch (error) {
      this.reportAsynchronousError(error);
    }
    let closeError: unknown;
    let hasCloseError = false;
    try {
      if (!this._layoutManager.isDestroyed) {
        this.emit('closed');
      }
    } catch (error) {
      closeError = error;
      hasCloseError = true;
    } finally {
      if (this._storageKey !== undefined) {
        try {
          localStorage.removeItem(this._storageKey);
          this._storageKey = undefined;
        } catch (error) {
          if (!hasCloseError) closeError = error;
          hasCloseError = true;
        }
      }
    }
    if (hasCloseError) {
      this.reportAsynchronousError(closeError);
    }
  }

  private clearReturnMarker(): void {
    if (this._returnMarkerAbandoned) {
      return;
    }
    const parentId = this._config.parentId;
    const groundItem = this._layoutManager.groundItem;
    if (
      parentId === null ||
      parentId === undefined ||
      groundItem === undefined
    ) {
      return;
    }
    const parentItem = groundItem.popInParentIds.includes(parentId)
      ? groundItem
      : groundItem.getItemsByPopInParentId(parentId)[0];
    if (parentItem === undefined) {
      return;
    }
    if (
      !this.hasReturnedToParent &&
      (parentItem.isRow || parentItem.isColumn)
    ) {
      this._layoutManager.rebasePendingPopoutsAfterDiscard(parentItem, this);
    }
    parentItem.removePopInParentId(parentId);
    if (parentItem.isRow || parentItem.isColumn) {
      (parentItem as RowOrColumn).checkCollapse();
    } else if (
      !parentItem.isGround &&
      parentItem.isClosable &&
      parentItem.contentItems.length === 0 &&
      parentItem.popInParentIds.length === 0
    ) {
      parentItem.remove();
    }
  }

  private rollbackPendingPopIn(): void {
    const rollback = this._pendingPopInRollback;
    if (rollback !== undefined) {
      rollback();
      this._pendingPopInRollback = undefined;
    }
  }

  private unbindPopInListener(): void {
    let cleanupError: unknown;
    if (
      this._initialisedStrelitInstance !== undefined &&
      this._popInListener !== undefined
    ) {
      const childLayout = this._initialisedStrelitInstance;
      if (typeof childLayout.off === 'function') {
        try {
          childLayout.off('popIn', this._popInListener);
        } catch (error) {
          cleanupError = error;
        }
      }
      this._initialisedStrelitInstance = undefined;
      this._popInListener = undefined;
    }
    if (cleanupError !== undefined) {
      throw cleanupError;
    }
  }

  private reportAsynchronousError(error: unknown): void {
    try {
      if (typeof globalThis.reportError === 'function') {
        globalThis.reportError(error);
      } else {
        console.error('Automatic pop-in failed', error);
      }
    } catch {
      // A failing host diagnostic hook must not discard persistence state.
    }
  }

  private tryGetStrelitInstance(): LayoutManager | undefined {
    return this._popoutWindow?.__strelitInstance ?? undefined;
  }
}

function isCrossOriginAccessError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'SecurityError'
  );
}

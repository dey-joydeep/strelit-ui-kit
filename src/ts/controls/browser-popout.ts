import {
  createResolvedLayoutConfigCopy,
  createResolvedPopoutLayoutConfigCopy,
  createResolvedRowOrColumnItemConfigDefault,
  minifyResolvedLayoutConfig,
  type ResolvedPopoutLayoutConfig,
  type ResolvedPopoutLayoutConfigWindow,
} from '../config/resolved-config';
import { PopoutBlockedError } from '../errors/external-error';
import {
  UnexpectedNullError,
  UnexpectedUndefinedError,
} from '../errors/internal-error';
import { ContentItem } from '../items/content-item';
import { LayoutManager } from '../layout-manager';
import { EventEmitter } from '../utils/event-emitter';
import { ItemType, Rect } from '../utils/types';
import { getErrorMessage, getUniqueId } from '../utils/utils';

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
  /** @internal */
  private _checkReadyInterval: ReturnType<typeof setTimeout> | undefined;
  /** @internal */
  private _isClosingOrPoppingIn = false;
  /** @internal */
  private _closeEventScheduled = false;

  /**
   * @param _config - StrelitLayout item config
   * @param _initialWindowSize - A map with width, height, top and left
   * @internal
   */
  constructor(
    /** @internal */
    private _config: ResolvedPopoutLayoutConfig,
    /** @internal */
    private _initialWindowSize: Rect,
    /** @internal */
    private _layoutManager: LayoutManager,
  ) {
    super();

    this._isInitialised = false;
    this._popoutWindow = null;
    this.createWindow();
  }

  /** Performs the to config operation. */
  toConfig(): ResolvedPopoutLayoutConfig {
    if (!this._isInitialised) {
      return createResolvedPopoutLayoutConfigCopy(this._config);
    }

    const strelitInstance = this.getStrelitInstance();
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
      root: strelitInstanceConfig.root,
      openPopouts: strelitInstanceConfig.openPopouts,
      settings: strelitInstanceConfig.settings,
      dimensions: strelitInstanceConfig.dimensions,
      header: strelitInstanceConfig.header,
      window,
      parentId: this._config.parentId,
      indexInParent: this._config.indexInParent,
      resolved: true,
    };

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
    this._isClosingOrPoppingIn = true;
    const strelitInstance = this.tryGetStrelitInstance();
    if (strelitInstance !== undefined) {
      strelitInstance.closeWindow();
    } else {
      try {
        this.getWindow().close();
      } catch {
        //
      }
    }
  }

  /**
   * Returns the popped out item to its original position. If the original
   * parent isn't available anymore it falls back to the layout's topmost element
   */
  popIn(): void {
    if (this._isClosingOrPoppingIn) {
      return;
    }
    this._isClosingOrPoppingIn = true;
    this.popInInternal();
    if (this._popoutWindow !== null) {
      const strelitInstance = this.tryGetStrelitInstance();
      if (strelitInstance !== undefined) {
        strelitInstance.closeWindow();
      } else {
        try {
          this.getWindow().close();
        } catch {
          //
        }
      }
    }
  }

  private popInInternal(): void {
    let parentItem: ContentItem | undefined;
    let index =
      this._config.indexInParent === null
        ? undefined
        : this._config.indexInParent;

    if (this._config.parentId === undefined) {
      return;
    }

    const strelitInstance = this._popoutWindow?.__strelitInstance ?? undefined;
    const strelitInstanceLayoutConfig =
      strelitInstance !== undefined
        ? strelitInstance.saveLayout()
        : this._config;
    const copiedStrelitLayoutConfig = createResolvedLayoutConfigCopy(
      strelitInstanceLayoutConfig,
    );
    const copiedRoot = copiedStrelitLayoutConfig.root;
    if (copiedRoot === undefined) {
      throw new UnexpectedUndefinedError('BPPIR19998');
    }
    const groundItem = this._layoutManager.groundItem;
    if (groundItem === undefined) {
      throw new UnexpectedUndefinedError('BPPIG34972');
    }
    if (this._config.parentId !== null) {
      parentItem = groundItem.getItemsByPopInParentId(this._config.parentId)[0];
    }

    /*
     * Fallback if parentItem is not available. Either add it to the topmost
     * item or make it the topmost item if the layout is empty
     */
    if (parentItem === undefined) {
      if (groundItem.contentItems.length > 0) {
        const rootItem = groundItem.contentItems[0];
        const rootCanAcceptReturnedItem =
          rootItem.isRow ||
          rootItem.isColumn ||
          (rootItem.isStack && copiedRoot.type === ItemType.component);
        if (!rootCanAcceptReturnedItem) {
          groundItem.removeChild(rootItem, true);
          parentItem = this._layoutManager.createAndInitContentItem(
            createResolvedRowOrColumnItemConfigDefault('row'),
            groundItem,
          );
          groundItem.addChild(parentItem);
          parentItem.addChild(rootItem);
          index = 1;
        } else {
          parentItem = rootItem;
          index = 0;
        }
      } else {
        parentItem = groundItem;
        index = 0;
      }
    }

    const newContentItem = this._layoutManager.createAndInitContentItem(
      copiedRoot,
      parentItem,
    );

    parentItem.addChild(newContentItem, index);
    this._onClose();
  }

  /**
   * Creates the URL and window parameter
   * and opens a new window
   * @internal
   */
  private createWindow(): void {
    const { url, storageKey } = this.createUrl();

    /**
     * Bogus title to prevent re-usage of existing window with the
     * same title. The actual title will be set by the new window's
     * StrelitLayout instance if it detects that it is in subWindowMode
     */
    const target = Math.floor(Math.random() * 1000000).toString(36);

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

    this._popoutWindow.addEventListener('load', () => this.positionWindow(), {
      passive: true,
    });
    this._popoutWindow.addEventListener(
      'beforeunload',
      () => {
        if (this._isClosingOrPoppingIn) {
          this._onClose();
          return;
        }
        this._isClosingOrPoppingIn = true;
        if (this._layoutManager.layoutConfig.settings.popInOnClose) {
          this.popInInternal();
        } else {
          this._onClose();
        }
      },
      { passive: true },
    );

    /**
     * Polling the childwindow to find out if StrelitLayout has been initialised
     * doesn't seem optimal, but the alternatives - adding a callback to the parent
     * window or raising an event on the window object - both would introduce knowledge
     * about the parent to the child window which we'd rather avoid
     */
    this._checkReadyInterval = setInterval(() => this.checkReady(), 10);
  }

  /** @internal */
  private checkReady() {
    if (this._popoutWindow === null) {
      this.clearCheckReadyInterval();
      return;
    } else {
      if (this._popoutWindow.closed) {
        this.clearCheckReadyInterval();
        this._onClose();
      } else if (
        this._popoutWindow.__strelitInstance &&
        this._popoutWindow.__strelitInstance.isInitialised
      ) {
        this.onInitialised();
        this.clearCheckReadyInterval();
      }
    }
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
  private onInitialised(): void {
    this._isInitialised = true;
    this.getStrelitInstance().on('popIn', () => this.popIn());
    this.emit('initialised');
  }

  /**
   * Invoked 50ms after the window unload event
   * @internal
   */
  private _onClose() {
    if (this._closeEventScheduled) {
      return;
    }
    this._closeEventScheduled = true;
    this.clearCheckReadyInterval();
    setTimeout(() => {
      this.emit('closed');
      this._closeEventScheduled = false;
      if (this._popoutWindow !== null && !this._popoutWindow.closed) {
        // beforeunload also fires for reloads and navigation. Resume detection
        // when reconciliation confirms that the window is still open.
        this._isClosingOrPoppingIn = false;
        this._checkReadyInterval = setInterval(() => this.checkReady(), 10);
      }
    }, 50);
  }

  private tryGetStrelitInstance(): LayoutManager | undefined {
    return this._popoutWindow?.__strelitInstance ?? undefined;
  }
}

import {
  type ComponentItemConfig,
  type LayoutConfig,
  type RowOrColumnItemConfig,
  type StackItemConfig,
  isComponentItemConfig,
  resolveLayoutConfig,
} from './config/config';
import {
  createResolvedLayoutConfigDefault,
  createResolvedLayoutConfigDimensionsCopy,
  createResolvedLayoutConfigHeaderCopy,
  createResolvedLayoutConfigSettingsCopy,
  type ResolvedComponentItemConfig,
  type ResolvedItemConfig,
  type ResolvedLayoutConfig,
  type ResolvedPopoutLayoutConfig,
  type ResolvedPopoutLayoutConfigWindow,
  type ResolvedRootItemConfig,
  type ResolvedRowOrColumnItemConfig,
  type ResolvedStackItemConfig,
  isResolvedRootItemConfig,
  isResolvedComponentItemConfig,
} from './config/resolved-config';
import {
  ComponentContainer,
  type ComponentContainerBindableComponent,
  type ComponentContainerComponent,
} from './container/component-container';
import { BrowserPopout } from './controls/browser-popout';
import { DragProxy } from './controls/drag-proxy';
import { DragSource } from './controls/drag-source';
import { DropTargetIndicator } from './controls/drop-target-indicator';
import { TransitionIndicator } from './controls/transition-indicator';
import { ConfigurationError } from './errors/external-error';
import {
  AssertError,
  UnexpectedNullError,
  UnexpectedUndefinedError,
  UnreachableCaseError,
} from './errors/internal-error';
import { ComponentItem } from './items/component-item';
import { ComponentParentableItem } from './items/component-parentable-item';
import { ContentItem, type ContentItemArea } from './items/content-item';
import { GroundItem } from './items/ground-item';
import { RowOrColumn } from './items/row-or-column';
import { Stack } from './items/stack';
import { checkConfigMinifierInitialise } from './utils/config-minifier';
import { DomConstants } from './utils/dom-constants';
import { DragListener } from './utils/drag-listener';
import { EventEmitter, EventEmitterBubblingEvent } from './utils/event-emitter';
import { reportSecondaryCleanupError } from './utils/error-reporting';
import { EventHub } from './utils/event-hub';
import {
  checkI18nStringsInitialise,
  I18nStringId,
  i18nStrings,
} from './utils/i18n-strings';
import {
  maximumConfigDepth,
  maximumConfigNodes,
} from './utils/resource-limits';
import {
  ComponentType,
  ItemType,
  Rect,
  ResponsiveMode,
  SerializableValue,
} from './utils/types';
import {
  getElementWidthAndHeight,
  removeFromArray,
  setElementHeight,
  setElementWidth,
} from './utils/utils';

/** @internal */
declare global {
  interface Window {
    __strelitInstance?: LayoutManager;
  }
}

/**
 * Represents layout manager before virtual recting event.
 * @public
 */
export type LayoutManagerBeforeVirtualRectingEvent = (
  this: void,
  count: number,
  containers?: readonly ComponentContainer[],
) => void;
/**
 * Represents layout manager after virtual recting event.
 * @public
 */
export type LayoutManagerAfterVirtualRectingEvent = (this: void) => void;

/** @internal */
export interface LayoutManagerConstructorParameters {
  subWindowLayoutConfig: LayoutConfig | undefined;
  isSubWindow: boolean;
  containerElement: HTMLElement | undefined;
}

const bodyContainerStyleProperties = [
  'height',
  'margin',
  'padding',
  'overflow',
] as const;

interface InlineStyleSnapshot {
  readonly element: HTMLElement;
  readonly properties: readonly {
    readonly name: (typeof bodyContainerStyleProperties)[number];
    readonly priority: string;
    readonly value: string;
  }[];
}

interface BodyContainerStyleOwnership {
  count: number;
  readonly snapshots: readonly InlineStyleSnapshot[];
}

const bodyContainerStyleOwnership = new WeakMap<
  Document,
  BodyContainerStyleOwnership
>();

function assertResolvedItemConfigWithinLimits(root: ResolvedItemConfig): void {
  type ValidationFrame =
    | { readonly config: ResolvedItemConfig; readonly depth: number }
    | { readonly completed: ResolvedItemConfig };

  const active = new WeakSet<object>();
  const stack: ValidationFrame[] = [{ config: root, depth: 0 }];
  let nodes = 0;

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) {
      break;
    }
    if ('completed' in frame) {
      active.delete(frame.completed);
      continue;
    }

    const { config, depth } = frame;
    if (depth > maximumConfigDepth || nodes >= maximumConfigNodes) {
      throw new ConfigurationError(
        'Resolved layout configuration exceeds resource limits',
      );
    }
    if (active.has(config)) {
      throw new ConfigurationError(
        'Resolved layout configuration contains a cycle',
      );
    }

    nodes++;
    const content = config.content;
    if (content.length > maximumConfigNodes - nodes) {
      throw new ConfigurationError(
        'Resolved layout configuration exceeds resource limits',
      );
    }

    active.add(config);
    stack.push({ completed: config });
    for (let index = content.length - 1; index >= 0; index--) {
      stack.push({ config: content[index], depth: depth + 1 });
    }
  }
}

/** @internal */
export function createLayoutManagerMaximisePlaceElement(
  document: Document,
): HTMLElement {
  const element = document.createElement('div');
  element.classList.add(DomConstants.ClassName.MaximisePlace);
  return element;
}

/** @internal */
export function createLayoutManagerTabDropPlaceholderElement(
  document: Document,
): HTMLElement {
  const element = document.createElement('div');
  element.classList.add(DomConstants.ClassName.DropTabPlaceholder);
  return element;
}

/**
 * Defines the layout manager location contract.
 * @public
 */
export interface LayoutManagerLocation {
  /** The parent item. */
  parentItem: ContentItem;
  /** The index. */
  index: number;
}

/**
 * Identifies supported layout manager location selector type id values.
 * @public
 */
export const enum LayoutManagerLocationSelectorTypeId {
  /** Uses the focused item value. */
  FocusedItem,
  /** Uses the focused stack value. */
  FocusedStack,
  /** Uses the first stack value. */
  FirstStack,
  /** Uses the first row or column value. */
  FirstRowOrColumn,
  /** Uses the first row value. */
  FirstRow,
  /** Uses the first column value. */
  FirstColumn,
  /** Uses the empty value. */
  Empty,
  /** Uses the root value. */
  Root,
}

/**
 * Defines the layout manager location selector contract.
 * @public
 */
export interface LayoutManagerLocationSelector {
  /** The type id. */
  typeId: LayoutManagerLocationSelectorTypeId;
  /** The index. */
  index?: number;
}

/**
 * Provides the layout manager default location selectors.
 * @public
 */
export const layoutManagerDefaultLocationSelectors: readonly LayoutManagerLocationSelector[] =
  [
    {
      /** The type id. */
      typeId: LayoutManagerLocationSelectorTypeId.FocusedStack,
      /** The index. */
      index: undefined,
    },
    {
      /** The type id. */
      typeId: LayoutManagerLocationSelectorTypeId.FirstStack,
      /** The index. */
      index: undefined,
    },
    {
      /** The type id. */
      typeId: LayoutManagerLocationSelectorTypeId.FirstRowOrColumn,
      /** The index. */
      index: undefined,
    },
    {
      /** The type id. */
      typeId: LayoutManagerLocationSelectorTypeId.Root,
      /** The index. */
      index: undefined,
    },
  ];

/** Location selectors that prefer placement after the focused item. @public */
export const layoutManagerAfterFocusedItemIfPossibleLocationSelectors: readonly LayoutManagerLocationSelector[] =
  [
    {
      /** The type id. */
      typeId: LayoutManagerLocationSelectorTypeId.FocusedItem,
      /** The index. */
      index: 1,
    },
    {
      /** The type id. */
      typeId: LayoutManagerLocationSelectorTypeId.FirstStack,
      /** The index. */
      index: undefined,
    },
    {
      /** The type id. */
      typeId: LayoutManagerLocationSelectorTypeId.FirstRowOrColumn,
      /** The index. */
      index: undefined,
    },
    {
      /** The type id. */
      typeId: LayoutManagerLocationSelectorTypeId.Root,
      /** The index. */
      index: undefined,
    },
  ];

/**
 * Coordinates the content tree, component binding, sizing, drag-and-drop, and popout lifecycle used by {@link StrelitLayout}.
 * @public
 */
export abstract class LayoutManager extends EventEmitter {
  /** Whether the layout will be automatically be resized to container whenever the container's size is changed
   * Default is true if <body> is the container otherwise false
   * Default will be changed to true for any container in the future
   */
  resizeWithContainerAutomatically = false;
  /** The debounce interval (in milliseconds) used whenever a layout is automatically resized.  0 means next tick */
  resizeDebounceInterval = 100;
  /** Extend the current debounce delay time period if it is triggered during the delay.
   * If this is true, the layout will only resize when its container has stopped being resized.
   * If it is false, the layout will resize at intervals while its container is being resized.
   */
  resizeDebounceExtendedWhenPossible = true;

  /** @internal */
  private _containerElement!: HTMLElement;
  /** @internal */
  private _isInitialised = false;
  /** @internal */
  private _isDestroyed = false;
  /** @internal */
  private _destroyCleanupFailed = false;
  /** @internal */
  private _groundItem: GroundItem | undefined = undefined;
  /** @internal */
  private _openPopouts: BrowserPopout[] = [];
  /** @internal */
  private _dropTargetIndicator: DropTargetIndicator | null = null;
  /** @internal */
  private _transitionIndicator: TransitionIndicator | null = null;
  /** @internal */
  private _resizeTimeoutId: ReturnType<typeof setTimeout> | undefined;
  /** @internal */
  private _itemAreas: ContentItemArea[] = [];
  /** @internal */
  private _maximisedStack: Stack | undefined;
  /** @internal */
  private readonly _maximisePlaceholder =
    createLayoutManagerMaximisePlaceElement(document);
  /** @internal */
  private readonly _tabDropPlaceholder =
    createLayoutManagerTabDropPlaceholderElement(document);
  /** @internal */
  private _dragSources: DragSource[] = [];
  private _activeDragProxy: DragProxy | undefined;
  /** @internal */
  private _updatingColumnsResponsive = false;
  /** @internal */
  private _firstLoad = true;
  /** @internal */
  private _contentItemTreeCreationDepth = 0;
  /** @internal */
  private readonly _eventHub = new EventHub(this);
  /** @internal */
  private _width: number | null = null;
  /** @internal */
  private _height: number | null = null;
  /** @internal */
  private _focusedComponentItem: ComponentItem | undefined;
  /** @internal */
  private _ownsBodyContainerStyles = false;
  /** @internal */
  private readonly _virtualSizedContainers: ComponentContainer[] = [];
  /** @internal */
  private _virtualSizedContainerAddingBeginCount = 0;
  /** @internal */
  private _sizeInvalidationBeginCount = 0;
  /** @internal */
  protected _subWindowLayoutConfig: LayoutConfig | undefined;

  /** @internal */
  private readonly _resizeObserver = new ResizeObserver(() =>
    this.handleContainerResize(),
  );
  /** @internal */
  private readonly _windowBeforeUnloadListener = () => this.onBeforeUnload();
  /** @internal */
  private _windowBeforeUnloadListening = false;
  /** @internal */
  private readonly _maximisedStackBeforeDestroyedListener = (
    ev: EventEmitterBubblingEvent,
  ) => this.cleanupBeforeMaximisedStackDestroyed(ev);

  /** Whether sub window. */
  readonly isSubWindow: boolean;
  /** The layout config. */
  layoutConfig!: ResolvedLayoutConfig;

  /** The before virtual recting event. */
  beforeVirtualRectingEvent: LayoutManagerBeforeVirtualRectingEvent | undefined;
  /** The after virtual recting event. */
  afterVirtualRectingEvent: LayoutManagerAfterVirtualRectingEvent | undefined;

  /** Gets the container. */
  get container(): HTMLElement {
    return this._containerElement;
  }
  /** Gets the is initialised. */
  get isInitialised(): boolean {
    return this._isInitialised;
  }
  /** Gets whether this instance is destroyed. */
  get isDestroyed(): boolean {
    return this._isDestroyed;
  }
  /** @internal */
  get groundItem(): GroundItem | undefined {
    return this._groundItem;
  }
  /** Gets the open popouts. */
  get openPopouts(): BrowserPopout[] {
    return this._openPopouts;
  }
  /** @internal */
  get dropTargetIndicator(): DropTargetIndicator | null {
    return this._dropTargetIndicator;
  }
  /** @internal */
  get transitionIndicator(): TransitionIndicator | null {
    return this._transitionIndicator;
  }
  /** Gets the width. */
  get width(): number | null {
    return this._width;
  }
  /** Gets the height. */
  get height(): number | null {
    return this._height;
  }
  /**
   * Retrieves the `EventHub` instance associated with this layout manager.
   * This can be used to propagate events between the windows
   * @public
   */
  get eventHub(): EventHub {
    return this._eventHub;
  }
  /** Gets the root item. */
  get rootItem(): ContentItem | undefined {
    if (this._groundItem === undefined) {
      throw new Error('Cannot access rootItem before init');
    } else {
      const groundContentItems = this._groundItem.contentItems;
      if (groundContentItems.length === 0) {
        return undefined;
      } else {
        return this._groundItem.contentItems[0];
      }
    }
  }
  /** Gets the focused component item. */
  get focusedComponentItem(): ComponentItem | undefined {
    return this._focusedComponentItem;
  }
  /** @internal */
  get tabDropPlaceholder(): HTMLElement {
    return this._tabDropPlaceholder;
  }
  /** Gets the maximised stack. */
  get maximisedStack(): Stack | undefined {
    return this._maximisedStack;
  }

  /**
   * @param container - A Dom HTML element. Defaults to body
   * @internal
   */
  constructor(parameters: LayoutManagerConstructorParameters) {
    super();

    this.isSubWindow = parameters.isSubWindow;

    this._subWindowLayoutConfig = parameters.subWindowLayoutConfig;

    checkI18nStringsInitialise();
    checkConfigMinifierInitialise();

    if (parameters.containerElement !== undefined) {
      this._containerElement = parameters.containerElement;
    }
  }

  /**
   * Destroys the LayoutManager instance itself as well as every ContentItem
   * within it. After this is called nothing should be left of the LayoutManager.
   *
   * This function only needs to be called if an application wishes to destroy the Strelit Layout object while
   * a page remains loaded. When a page is unloaded, all resources claimed by Strelit Layout will automatically
   * be released.
   */
  destroy(): void {
    if (this._isDestroyed && !this._destroyCleanupFailed) {
      return;
    }
    this._isDestroyed = true;

    let firstError: unknown;
    let hasError = false;
    const attempt = (operation: () => void) => {
      try {
        operation();
      } catch (error) {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
      }
    };

    if (this._windowBeforeUnloadListening) {
      attempt(() =>
        globalThis.removeEventListener(
          'beforeunload',
          this._windowBeforeUnloadListener,
        ),
      );
      if (!hasError) {
        this._windowBeforeUnloadListening = false;
      }
    }

    if (this.layoutConfig !== undefined) {
      if (this.layoutConfig.settings.closePopoutsOnUnload) {
        attempt(() => this.closeAllOpenPopouts());
      }
    }
    const openPopouts = [...this._openPopouts];
    const remainingOpenPopouts: BrowserPopout[] = [];
    for (const popout of openPopouts) {
      let destroyed = false;
      attempt(() => {
        if (typeof popout.destroy === 'function') {
          popout.destroy();
        }
        destroyed = true;
      });
      if (!destroyed) {
        remainingOpenPopouts.push(popout);
      }
    }
    this._openPopouts = remainingOpenPopouts;

    attempt(() => this.checkClearResizeTimeout());

    if (this._activeDragProxy !== undefined) {
      const activeDragProxy = this._activeDragProxy;
      attempt(() => activeDragProxy.cancel());
    }

    if (this._groundItem !== undefined) {
      const groundItem = this._groundItem;
      let destroyed = false;
      attempt(() => {
        groundItem.destroy();
        destroyed = true;
      });
      if (destroyed) {
        this._groundItem = undefined;
      }
    }
    attempt(() => this._tabDropPlaceholder.remove());
    if (this._dropTargetIndicator !== null) {
      const dropTargetIndicator = this._dropTargetIndicator;
      let destroyed = false;
      attempt(() => {
        dropTargetIndicator.destroy();
        destroyed = true;
      });
      if (destroyed) {
        this._dropTargetIndicator = null;
      }
    }
    if (this._transitionIndicator !== null) {
      const transitionIndicator = this._transitionIndicator;
      let destroyed = false;
      attempt(() => {
        transitionIndicator.destroy();
        destroyed = true;
      });
      if (destroyed) {
        this._transitionIndicator = null;
      }
    }
    const dragSources = this._dragSources;
    const remainingDragSources: DragSource[] = [];
    for (const dragSource of dragSources) {
      let destroyed = false;
      attempt(() => {
        dragSource.destroy();
        destroyed = true;
      });
      if (!destroyed) {
        remainingDragSources.push(dragSource);
      }
    }
    this._dragSources = remainingDragSources;

    this._isInitialised = false;
    attempt(() => this._maximisePlaceholder.remove());

    attempt(() => this._resizeObserver.disconnect());
    attempt(() => this._eventHub.destroy());
    attempt(() => this.restoreBodyContainerStyles());

    if (hasError) {
      this._destroyCleanupFailed = true;
      throw firstError;
    }
    this._destroyCleanupFailed = false;
  }

  /** @internal */
  abstract bindComponent(
    container: ComponentContainer,
    itemConfig: ResolvedComponentItemConfig,
  ): ComponentContainerBindableComponent;
  /** @internal */
  abstract unbindComponent(
    container: ComponentContainer,
    virtual: boolean,
    component: ComponentContainerComponent | undefined,
  ): void;

  /**
   * Called from StrelitLayout class. Finishes of init
   * @internal
   */
  init(): void {
    if (this._isInitialised) {
      return;
    }

    try {
      this.setContainer();
      this._dropTargetIndicator = new DropTargetIndicator(/*this.container*/);
      this._transitionIndicator = new TransitionIndicator();
      this.updateSizeFromContainer();

      let subWindowRootConfig: ResolvedRootItemConfig | undefined;
      if (this.isSubWindow) {
        if (this._subWindowLayoutConfig === undefined) {
          // SubWindow LayoutConfig should have been generated by constructor
          throw new UnexpectedUndefinedError('LMIU07155');
        } else {
          const root = this._subWindowLayoutConfig.root;
          if (root === undefined) {
            // SubWindow LayoutConfig must not be empty
            throw new AssertError('LMIC07156');
          }
          const resolvedLayoutConfig = resolveLayoutConfig(
            this._subWindowLayoutConfig,
          );
          subWindowRootConfig = resolvedLayoutConfig.root;
          // remove root from layoutConfig
          this.layoutConfig = {
            ...resolvedLayoutConfig,
            root: undefined,
          };
        }
      } else {
        this.layoutConfig = createResolvedLayoutConfigDefault();
      }
      const layoutConfig = this.layoutConfig;
      this._isInitialised = true;
      this._groundItem = new GroundItem(
        this,
        layoutConfig.root,
        this._containerElement,
      );
      this._groundItem.init();

      if (subWindowRootConfig !== undefined) {
        this._groundItem.loadRoot(subWindowRootConfig);
      }
      this.checkLoadedLayoutMaximiseItem();

      this._resizeObserver.observe(this._containerElement);
      this.adjustColumnsResponsive();
      this.emit('initialised');
    } catch (error) {
      try {
        this.destroy();
      } catch (cleanupError) {
        reportSecondaryCleanupError('layout initialization', cleanupError);
      }
      throw error;
    }
  }

  /**
   * Loads a new layout
   * @param layoutConfig - New layout to be loaded
   */
  loadLayout(layoutConfig: LayoutConfig): void {
    if (!this.isInitialised) {
      throw new Error('Cannot load a layout before initialization');
    } else {
      if (this._groundItem === undefined) {
        throw new UnexpectedUndefinedError('LMLL11119');
      }
      const previousLayoutConfig = this.layoutConfig;
      const previousOpenPopouts = [...this._openPopouts];
      const previousMaximisedStack = this._maximisedStack;
      const previousFocusedComponentItem = this._focusedComponentItem;
      const previousWindowBeforeUnloadListening =
        this._windowBeforeUnloadListening;
      this.layoutConfig = resolveLayoutConfig(layoutConfig);
      let incomingOpenPopouts: BrowserPopout[] = [];
      try {
        this.createSubWindows();
        incomingOpenPopouts = this._openPopouts.slice(
          previousOpenPopouts.length,
        );
        this._groundItem.loadRoot(this.layoutConfig.root, () => {
          this.checkLoadedLayoutMaximiseItem();
          this.adjustColumnsResponsive();
        });
      } catch (error) {
        const reportRollbackError = (rollbackError: unknown) => {
          try {
            if (typeof globalThis.reportError === 'function') {
              globalThis.reportError(rollbackError);
            } else {
              console.error(
                'Layout replacement rollback failed',
                rollbackError,
              );
            }
          } catch {
            // Host diagnostics must not replace the original load failure.
          }
        };
        const attemptRollback = (operation: () => void) => {
          try {
            operation();
          } catch (rollbackError) {
            reportRollbackError(rollbackError);
          }
        };
        incomingOpenPopouts = this._openPopouts.slice(
          previousOpenPopouts.length,
        );
        const failedIncomingPopouts: BrowserPopout[] = [];
        for (const popout of incomingOpenPopouts) {
          try {
            popout.close();
          } catch {
            // Popout cleanup must not interrupt root and configuration rollback.
            failedIncomingPopouts.push(popout);
          }
        }
        this._openPopouts = [...previousOpenPopouts, ...failedIncomingPopouts];
        this.layoutConfig = previousLayoutConfig;
        if (
          this._windowBeforeUnloadListening !==
          previousWindowBeforeUnloadListening
        ) {
          if (previousWindowBeforeUnloadListening) {
            attemptRollback(() => {
              globalThis.addEventListener(
                'beforeunload',
                this._windowBeforeUnloadListener,
                { passive: true },
              );
              this._windowBeforeUnloadListening = true;
            });
          } else {
            attemptRollback(() => {
              globalThis.removeEventListener(
                'beforeunload',
                this._windowBeforeUnloadListener,
              );
              this._windowBeforeUnloadListening = false;
            });
          }
        }
        if (previousMaximisedStack === undefined) {
          attemptRollback(() => this.setMaximisedStack(undefined));
        } else if (this._maximisedStack !== previousMaximisedStack) {
          attemptRollback(() => previousMaximisedStack.maximise());
        }
        attemptRollback(() =>
          this.setFocusedComponentItem(previousFocusedComponentItem, true),
        );
        throw error;
      }

      const failedPreviousPopouts: BrowserPopout[] = [];
      const reportCleanupError = (error: unknown) => {
        try {
          if (typeof globalThis.reportError === 'function') {
            globalThis.reportError(error);
          } else {
            console.error('Failed to close a previous layout popout', error);
          }
        } catch {
          // Host diagnostics must not invalidate the committed replacement.
        }
      };
      for (const popout of previousOpenPopouts) {
        try {
          popout.close();
          try {
            if (!popout.getWindow().closed) {
              failedPreviousPopouts.push(popout);
            }
          } catch (error) {
            if (!(error instanceof UnexpectedNullError)) {
              failedPreviousPopouts.push(popout);
              reportCleanupError(error);
            }
          }
        } catch (error) {
          failedPreviousPopouts.push(popout);
          reportCleanupError(error);
        }
      }
      this._openPopouts = [...failedPreviousPopouts, ...incomingOpenPopouts];
      if (this._openPopouts.length === 0 && this._windowBeforeUnloadListening) {
        try {
          globalThis.removeEventListener(
            'beforeunload',
            this._windowBeforeUnloadListener,
          );
          this._windowBeforeUnloadListening = false;
        } catch (error) {
          reportCleanupError(error);
        }
      }
    }
  }

  /**
   * Creates a layout configuration object based on the the current state
   *
   * @public
   * @returns StrelitLayout configuration
   */
  saveLayout(): ResolvedLayoutConfig {
    if (!this._isInitialised) {
      throw new Error("Can't create config, layout not yet initialised");
    } else {
      // if (root !== undefined && !(root instanceof ContentItem)) {
      //     throw new Error('Root must be a ContentItem');
      // }

      /*
       * Content
       */
      if (this._groundItem === undefined) {
        throw new UnexpectedUndefinedError('LMTC18244');
      }
      const groundContent = this._groundItem.calculateConfigContent();

      let rootItemConfig: ResolvedRootItemConfig | undefined;
      if (groundContent.length !== 1) {
        rootItemConfig = undefined;
      } else {
        rootItemConfig = groundContent[0];
      }

      /*
       * Retrieve config for subwindows
       */
      this.reconcilePopoutWindows();
      const openPopouts: ResolvedPopoutLayoutConfig[] = [];
      for (const element of this._openPopouts) {
        let initialised = false;
        try {
          initialised = element.getStrelitInstance().isInitialised;
        } catch {
          // A child instance is unavailable while its window is starting.
        }
        const popoutConfig = element.toConfig();
        const parentId = popoutConfig.parentId;
        const sourceAttached =
          typeof parentId === 'string' &&
          (this._groundItem.popInParentIds.includes(parentId) ||
            this._groundItem.getItemsByPopInParentId(parentId).length > 0);
        if (initialised || !sourceAttached) {
          openPopouts.push(popoutConfig);
        }
      }

      const config: ResolvedLayoutConfig = {
        root: rootItemConfig,
        openPopouts,
        settings: createResolvedLayoutConfigSettingsCopy(
          this.layoutConfig.settings,
        ),
        dimensions: createResolvedLayoutConfigDimensionsCopy(
          this.layoutConfig.dimensions,
        ),
        header: createResolvedLayoutConfigHeaderCopy(this.layoutConfig.header),
        resolved: true,
      };

      return config;
    }
  }

  /**
   * Removes any existing layout. Effectively, an empty layout will be loaded.
   */

  clear(): void {
    if (this._groundItem === undefined) {
      throw new UnexpectedUndefinedError('LMCL11129');
    } else {
      this._groundItem.clearRoot();
    }
  }

  /**
   * Adds a new ComponentItem.  Will use default location selectors to ensure a location is found and
   * component is successfully added
   * @param componentType - Type of component to be created.
   * @param componentState - Optional initial state to be assigned to component
   * @returns New ComponentItem created.
   */
  newComponent(
    componentType: ComponentType,
    componentState?: SerializableValue,
    title?: string,
  ): ComponentItem {
    const componentItem = this.newComponentAtLocation(
      componentType,
      componentState,
      title,
    );
    if (componentItem === undefined) {
      throw new AssertError('LMNC65588');
    } else {
      return componentItem;
    }
  }

  /**
   * Adds a ComponentItem at the first valid selector location.
   * @param componentType - Type of component to be created.
   * @param componentState - Optional initial state to be assigned to component
   * @param locationSelectors - Array of location selectors used to find location in layout where component
   * will be added. First location in array which is valid will be used. If locationSelectors is undefined,
   * `layoutManagerDefaultLocationSelectors` will be used
   * @returns New ComponentItem created or undefined if no valid location selector was in array.
   */
  newComponentAtLocation(
    componentType: ComponentType,
    componentState?: SerializableValue,
    title?: string,
    locationSelectors?: LayoutManagerLocationSelector[],
  ): ComponentItem | undefined {
    if (this._groundItem === undefined) {
      throw new Error('Cannot add component before init');
    } else {
      const location = this.addComponentAtLocation(
        componentType,
        componentState,
        title,
        locationSelectors,
      );
      if (location === undefined) {
        return undefined;
      } else {
        const createdItem = location.parentItem.contentItems[location.index];
        if (!ContentItem.isComponentItem(createdItem)) {
          throw new AssertError('LMNC992877533');
        } else {
          return createdItem;
        }
      }
    }
  }

  /**
   * Adds a new ComponentItem.  Will use default location selectors to ensure a location is found and
   * component is successfully added
   * @param componentType - Type of component to be created.
   * @param componentState - Optional initial state to be assigned to component
   * @returns Location of new ComponentItem created.
   */
  addComponent(
    componentType: ComponentType,
    componentState?: SerializableValue,
    title?: string,
  ): LayoutManagerLocation {
    const location = this.addComponentAtLocation(
      componentType,
      componentState,
      title,
    );
    if (location === undefined) {
      throw new AssertError('LMAC99943');
    } else {
      return location;
    }
  }

  /**
   * Adds a ComponentItem at the first valid selector location.
   * @param componentType - Type of component to be created.
   * @param componentState - Optional initial state to be assigned to component
   * @param locationSelectors - Array of location selectors used to find determine location in layout where component
   * will be added. First location in array which is valid will be used. If undefined,
   * `layoutManagerDefaultLocationSelectors` will be used.
   * @returns Location of new ComponentItem created or undefined if no valid location selector was in array.
   */
  addComponentAtLocation(
    componentType: ComponentType,
    componentState?: SerializableValue,
    title?: string,
    locationSelectors?: readonly LayoutManagerLocationSelector[],
  ): LayoutManagerLocation | undefined {
    const itemConfig: ComponentItemConfig = {
      type: 'component',
      componentType,
      componentState,
      title,
    };

    return this.addItemAtLocation(itemConfig, locationSelectors);
  }

  /**
   * Adds a new ContentItem.  Will use default location selectors to ensure a location is found and
   * component is successfully added
   * @param itemConfig - ResolvedItemConfig of child to be added.
   * @returns New ContentItem created.
   */
  newItem(
    itemConfig: RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig,
  ): ContentItem {
    const contentItem = this.newItemAtLocation(itemConfig);
    if (contentItem === undefined) {
      throw new AssertError('LMNC65588');
    } else {
      return contentItem;
    }
  }

  /**
   * Adds a new child ContentItem under the root ContentItem.  If a root does not exist, then create root ContentItem instead
   * @param itemConfig - ResolvedItemConfig of child to be added.
   * @param locationSelectors - Array of location selectors used to find determine location in layout where ContentItem
   * will be added. First location in array which is valid will be used. If undefined,
   * `layoutManagerDefaultLocationSelectors` will be used.
   * @returns New ContentItem created or undefined if no valid location selector was in array. */
  newItemAtLocation(
    itemConfig: RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig,
    locationSelectors?: readonly LayoutManagerLocationSelector[],
  ): ContentItem | undefined {
    if (this._groundItem === undefined) {
      throw new Error('Cannot add component before init');
    } else {
      const location = this.addItemAtLocation(itemConfig, locationSelectors);
      if (location === undefined) {
        return undefined;
      } else {
        const createdItem = location.parentItem.contentItems[location.index];
        return createdItem;
      }
    }
  }

  /**
   * Adds a new ContentItem.  Will use default location selectors to ensure a location is found and
   * component is successfully added.
   * @param itemConfig - ResolvedItemConfig of child to be added.
   * @returns Location of new ContentItem created. */
  addItem(
    itemConfig: RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig,
  ): LayoutManagerLocation {
    const location = this.addItemAtLocation(itemConfig);
    if (location === undefined) {
      throw new AssertError('LMAI99943');
    } else {
      return location;
    }
  }

  /**
   * Adds a ContentItem at the first valid selector location.
   * @param itemConfig - ResolvedItemConfig of child to be added.
   * @param locationSelectors - Array of location selectors used to find determine location in layout where ContentItem
   * will be added. First location in array which is valid will be used. If undefined,
   * `layoutManagerDefaultLocationSelectors` will be used.
   * @returns Location of new ContentItem created or undefined if no valid location selector was in array. */
  addItemAtLocation(
    itemConfig: RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig,
    locationSelectors?: readonly LayoutManagerLocationSelector[],
  ): LayoutManagerLocation | undefined {
    if (this._groundItem === undefined) {
      throw new Error('Cannot add component before init');
    } else {
      // defaultLocationSelectors should always find a location
      locationSelectors ??= layoutManagerDefaultLocationSelectors;

      const location = this.findFirstLocation(locationSelectors, itemConfig);
      if (location === undefined) {
        return undefined;
      } else {
        let parentItem = location.parentItem;
        let addIdx: number;
        switch (parentItem.type) {
          case ItemType.ground: {
            const groundItem = parentItem as GroundItem;
            addIdx = groundItem.addItem(itemConfig, location.index);
            if (addIdx >= 0) {
              parentItem = this._groundItem.contentItems[0]; // was added to rootItem
            } else {
              addIdx = 0; // was added as rootItem (which is the first and only ContentItem in GroundItem)
            }
            break;
          }
          case ItemType.row:
          case ItemType.column: {
            const rowOrColumn = parentItem as RowOrColumn;
            addIdx = rowOrColumn.addItem(itemConfig, location.index);
            break;
          }
          case ItemType.stack: {
            if (!isComponentItemConfig(itemConfig)) {
              throw Error(
                i18nStrings[I18nStringId.ItemConfigIsNotTypeComponent],
              );
            } else {
              const stack = parentItem as Stack;
              addIdx = stack.addItem(itemConfig, location.index);
              break;
            }
          }
          case ItemType.component: {
            throw new AssertError('LMAIALC87444602');
          }
          default:
            throw new UnreachableCaseError('LMAIALU98881733', parentItem.type);
        }

        if (isComponentItemConfig(itemConfig)) {
          // see if stack was inserted
          const item = parentItem.contentItems[addIdx];
          if (ContentItem.isStack(item)) {
            parentItem = item;
            addIdx = 0;
          }
        }

        location.parentItem = parentItem;
        location.index = addIdx;

        return location;
      }
    }
  }

  /** Loads the specified component ResolvedItemConfig as root.
   * This can be used to display a Component all by itself.  The layout cannot be changed other than having another new layout loaded.
   * Note that, if this layout is saved and reloaded, it will reload with the Component as a child of a Stack.
   */
  loadComponentAsRoot(itemConfig: ComponentItemConfig): void {
    if (this._groundItem === undefined) {
      throw new Error('Cannot add item before init');
    } else {
      this._groundItem.loadComponentAsRoot(itemConfig);
    }
  }

  /**
   * Updates the layout managers size
   *
   * @param width - Width in pixels
   * @param height - Height in pixels
   */
  setSize(width: number, height: number): void {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 0 ||
      height < 0
    ) {
      throw new RangeError('Layout dimensions must be finite and non-negative');
    }
    this._width = width;
    this._height = height;

    if (this._isInitialised) {
      if (this._groundItem === undefined) {
        throw new UnexpectedUndefinedError('LMUS18881');
      } else {
        this._groundItem.setSize(this._width, this._height);

        if (this._maximisedStack) {
          setElementWidth(this._maximisedStack.element, this._width);
          setElementHeight(this._maximisedStack.element, this._height);
          this._maximisedStack.updateSize(false);
        }

        this.adjustColumnsResponsive();
      }
    }
  }

  /** @internal */
  beginSizeInvalidation(): void {
    this._sizeInvalidationBeginCount++;
  }

  /** @internal */
  endSizeInvalidation(): void {
    if (--this._sizeInvalidationBeginCount === 0) {
      this.updateSizeFromContainer();
    }
  }

  /** @internal */
  updateSizeFromContainer(): void {
    const { width, height } = getElementWidthAndHeight(this._containerElement);
    this.setSize(width, height);
  }

  /**
   * Update the size of the root ContentItem.  This will update the size of all contentItems in the tree
   * @param force - In some cases the size is not updated if it has not changed. In this case, events
   * (such as ComponentContainer.virtualRectingRequiredEvent) are not fired. Setting force to true, ensures the size is updated regardless, and
   * the respective events are fired. This is sometimes necessary when a component's size has not changed but it has become visible, and the
   * relevant events need to be fired.
   */
  updateRootSize(force = false): void {
    if (this._groundItem === undefined) {
      throw new UnexpectedUndefinedError('LMURS28881');
    } else {
      this._groundItem.updateSize(force);
    }
  }

  /**
   * Creates and initializes a content-item tree from a resolved configuration.
   *
   * @throws {@link ConfigurationError} When the supplied tree is cyclic, malformed, deeper than 128 items, or contains more than 10,000 nodes.
   * @public
   */
  createAndInitContentItem(
    config: ResolvedItemConfig,
    parent: ContentItem,
  ): ContentItem {
    const newItem = this.createContentItem(config, parent);
    try {
      newItem.init();
    } catch (error) {
      try {
        newItem.destroy();
      } catch (cleanupError) {
        reportSecondaryCleanupError(
          'content-item initialization',
          cleanupError,
        );
      }
      throw error;
    }
    return newItem;
  }

  /**
   * Recursively creates new item tree structures based on a provided
   * ItemConfiguration object
   *
   * @param config - ResolvedItemConfig
   * @param parent - The item the newly created item should be a child of
   * @internal
   */
  createContentItem(
    config: ResolvedItemConfig,
    parent: ContentItem,
  ): ContentItem {
    if (this._contentItemTreeCreationDepth === 0) {
      assertResolvedItemConfigWithinLimits(config);
    }
    this._contentItemTreeCreationDepth++;
    try {
      if (typeof config.type !== 'string') {
        throw new ConfigurationError(
          "Missing parameter 'type'",
          JSON.stringify(config),
        );
      }

      /**
       * We add an additional stack around every component that's not within a stack anyways.
       */
      if (
        // If this is a component
        isResolvedComponentItemConfig(config) &&
        // and it's not already within a stack
        !(parent instanceof Stack) &&
        // and we have a parent
        !!parent &&
        // and it's not the topmost item in a new window
        !(this.isSubWindow && parent instanceof GroundItem)
      ) {
        const stackConfig: ResolvedStackItemConfig = {
          type: ItemType.stack,
          content: [config],
          size: config.size,
          sizeUnit: config.sizeUnit,
          minSize: config.minSize,
          minSizeUnit: config.minSizeUnit,
          id: config.id,
          maximised: config.maximised,
          isClosable: config.isClosable,
          activeItemIndex: 0,
          header: undefined,
        };

        config = stackConfig;
      }

      const contentItem = this.createContentItemFromConfig(config, parent);
      return contentItem;
    } finally {
      this._contentItemTreeCreationDepth--;
    }
  }

  /** Finds first component item by id. */
  findFirstComponentItemById(id: string): ComponentItem | undefined {
    if (this._groundItem === undefined) {
      throw new UnexpectedUndefinedError('LMFFCIBI82446');
    } else {
      return this.findFirstContentItemTypeByIdRecursive(
        ItemType.component,
        id,
        this._groundItem,
      ) as ComponentItem;
    }
  }

  /**
   * Returns every content item in the current layout whose id matches `id`.
   */
  getItemsById(id: string): ContentItem[] {
    const rootItem = this.rootItem;
    return rootItem === undefined ? [] : rootItem.getItemsById(id);
  }

  /**
   * Returns every content item in the current layout whose type matches `type`.
   */
  getItemsByType(type: ItemType): ContentItem[] {
    const rootItem = this.rootItem;
    return rootItem === undefined ? [] : rootItem.getItemsByType(type);
  }

  /**
   * Returns every component item in the current layout whose componentType matches `componentType`.
   */
  getComponentItemsByType(componentType: ComponentType): ComponentItem[] {
    const rootItem = this.rootItem;
    return rootItem === undefined
      ? []
      : rootItem.getComponentItemsByType(componentType);
  }

  /**
   * Creates a popout window with the specified content at the specified position
   *
   * @param itemConfigOrContentItem - The content of the popout window's layout manager derived from either
   * a {@link ContentItem} or `ItemConfig` or ResolvedItemConfig content (array of `ItemConfig`)
   * @param positionAndSize - The width, height, left and top of Popout window
   * @param parentId -The id of the element this item will be appended to when popIn is called
   * @param indexInParent - The position of this item within its parent element
   */

  createPopout(
    itemConfigOrContentItem: ContentItem | ResolvedRootItemConfig,
    positionAndSize: ResolvedPopoutLayoutConfigWindow,
    parentId: string | null,
    indexInParent: number | null,
  ): BrowserPopout {
    if (itemConfigOrContentItem instanceof ContentItem) {
      return this.createPopoutFromContentItem(
        itemConfigOrContentItem,
        positionAndSize,
        parentId,
        indexInParent,
      );
    } else {
      return this.createPopoutFromItemConfig(
        itemConfigOrContentItem,
        positionAndSize,
        parentId,
        indexInParent,
      );
    }
  }

  /** @internal */
  createPopoutFromContentItem(
    item: ContentItem,
    window: ResolvedPopoutLayoutConfigWindow | undefined,
    parentId: string | null,
    indexInParent: number | null | undefined,
  ): BrowserPopout {
    /**
     * If the item is the only component within a stack or for some
     * other reason the only child of its parent the parent will be destroyed
     * when the child is removed.
     *
     * In order to support this we move up the tree until we find something
     * that will remain after the item is being popped out
     */
    let parent = item.parent;
    let child = item;
    while (
      parent !== null &&
      parent.contentItems.length === 1 &&
      !parent.isGround
    ) {
      child = parent;
      parent = parent.parent;
    }

    if (parent === null) {
      throw new UnexpectedNullError('LMCPFCI00834');
    } else {
      indexInParent ??= parent.contentItems.indexOf(child);

      if (parentId !== null) {
        parent.addPopInParentId(parentId);
      }

      if (window === undefined) {
        const windowLeft = globalThis.screenX || globalThis.screenLeft;
        const windowTop = globalThis.screenY || globalThis.screenTop;
        const rect = item.element.getBoundingClientRect();
        const { width, height } = getElementWidthAndHeight(item.element);

        window = {
          left: windowLeft + rect.left,
          top: windowTop + rect.top,
          width,
          height,
        };
      }

      const itemConfig = child.toConfig();
      if (!isResolvedRootItemConfig(itemConfig)) {
        throw new Error(
          `${i18nStrings[I18nStringId.PopoutCannotBeCreatedWithGroundItemConfig]}`,
        );
      } else {
        const browserPopout = this.createPopoutFromItemConfig(
          itemConfig,
          window,
          parentId,
          indexInParent,
          () => {
            if (child.parent === parent) {
              parent.removeChild(child);
            }
          },
        );
        try {
          browserPopout.getWindow();
        } catch {
          return browserPopout;
        }
        return browserPopout;
      }
    }
  }

  /** @internal */
  beginVirtualSizedContainerAdding(): void {
    if (++this._virtualSizedContainerAddingBeginCount === 1) {
      this._virtualSizedContainers.length = 0;
    }
  }

  /** @internal */
  addVirtualSizedContainer(container: ComponentContainer): void {
    this._virtualSizedContainers.push(container);
  }

  /** @internal */
  endVirtualSizedContainerAdding(): void {
    if (--this._virtualSizedContainerAddingBeginCount === 0) {
      try {
        const count = this._virtualSizedContainers.length;
        if (count > 0) {
          this.fireBeforeVirtualRectingEvent(
            count,
            this._virtualSizedContainers,
          );
          for (let i = 0; i < count; i++) {
            const container = this._virtualSizedContainers[i];
            container.notifyVirtualRectingRequired();
          }
          this.fireAfterVirtualRectingEvent();
        }
      } finally {
        this._virtualSizedContainers.length = 0;
      }
    }
  }

  /** @internal */
  fireBeforeVirtualRectingEvent(
    count: number,
    containers?: readonly ComponentContainer[],
  ): void {
    if (this.beforeVirtualRectingEvent !== undefined) {
      this.beforeVirtualRectingEvent(count, containers);
    }
  }

  /** @internal */
  fireAfterVirtualRectingEvent(): void {
    if (this.afterVirtualRectingEvent !== undefined) {
      this.afterVirtualRectingEvent();
    }
  }

  /** @internal */
  private createPopoutFromItemConfig(
    rootItemConfig: ResolvedRootItemConfig,
    window: ResolvedPopoutLayoutConfigWindow,
    parentId: string | null,
    indexInParent: number | null,
    beforeWindowOpened?: () => void,
  ) {
    const layoutConfig = this.saveLayout();

    const popoutLayoutConfig: ResolvedPopoutLayoutConfig = {
      root: rootItemConfig,
      openPopouts: [],
      settings: layoutConfig.settings,
      dimensions: layoutConfig.dimensions,
      header: layoutConfig.header,
      window,
      parentId,
      indexInParent,
      resolved: true,
    };

    return this.createBrowserPopout(popoutLayoutConfig, beforeWindowOpened);
  }

  /** @internal */
  createPopoutFromPopoutLayoutConfig(
    config: ResolvedPopoutLayoutConfig,
  ): BrowserPopout {
    return this.createBrowserPopout(config);
  }

  private createBrowserPopout(
    config: ResolvedPopoutLayoutConfig,
    beforeWindowOpened?: () => void,
  ): BrowserPopout {
    const configWindow = config.window;
    const initialWindow: Rect = {
      left:
        configWindow.left ?? (globalThis.screenX || globalThis.screenLeft + 20),
      top:
        configWindow.top ?? (globalThis.screenY || globalThis.screenTop + 20),
      width: configWindow.width ?? 500,
      height: configWindow.height ?? 309,
    };

    const browserPopout = new BrowserPopout(config, initialWindow, this);

    try {
      browserPopout.getWindow();
    } catch {
      return browserPopout;
    }

    browserPopout.on('initialised', () => {
      if (this._isDestroyed) {
        return;
      }
      beforeWindowOpened?.();
      if (!this._isDestroyed) {
        this.emit('windowOpened', browserPopout);
      }
    });
    browserPopout.on('closed', () => {
      if (!this._isDestroyed) {
        this.reconcilePopoutWindows();
      }
    });

    this._openPopouts.push(browserPopout);

    if (
      this.layoutConfig.settings.closePopoutsOnUnload &&
      !this._windowBeforeUnloadListening
    ) {
      globalThis.addEventListener(
        'beforeunload',
        this._windowBeforeUnloadListener,
        { passive: true },
      );
      this._windowBeforeUnloadListening = true;
    }

    return browserPopout;
  }

  /**
   * Closes all Open Popouts
   * Applications can call this method when a page is unloaded to remove its open popouts
   */

  closeAllOpenPopouts() {
    const openPopouts = [...this._openPopouts];
    const failedPopouts: BrowserPopout[] = [];

    let firstError: unknown;
    let hasError = false;
    for (const element of openPopouts) {
      try {
        element.close();
      } catch (error) {
        failedPopouts.push(element);
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
        continue;
      }
      try {
        if (!element.getWindow().closed) {
          failedPopouts.push(element);
        }
      } catch (error) {
        if (!(error instanceof UnexpectedNullError)) {
          // Keep inaccessible live windows owned until closure is known.
          failedPopouts.push(element);
        }
      }
    }
    this._openPopouts = failedPopouts;

    if (failedPopouts.length === 0 && this._windowBeforeUnloadListening) {
      try {
        globalThis.removeEventListener(
          'beforeunload',
          this._windowBeforeUnloadListener,
        );
        this._windowBeforeUnloadListening = false;
      } catch (error) {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
      }
    }

    if (hasError) {
      throw firstError;
    }
  }

  /**
   * Attaches DragListener to any given DOM element
   * and turns it into a way of creating new ComponentItems
   * by 'dragging' the DOM element into the layout
   *
   * @param element - The HTML element which will be listened to for commencement of drag.
   * @param itemConfigCallback - Callback which provides the ItemConfig to use for the drag-created component.
   *
   * @returns an opaque object that identifies the DOM element
   *          and the attached itemConfig. This can be used in
   *          removeDragSource() later to get rid of the drag listeners.
   */
  newDragSource(
    element: HTMLElement,
    itemConfigCallback: () => ComponentItemConfig,
  ): DragSource {
    (
      this.layoutConfig.settings as {
        constrainDragToContainer: boolean;
      }
    ).constrainDragToContainer = false;
    const dragSource = new DragSource(this, element, [], itemConfigCallback);
    this._dragSources.push(dragSource);

    return dragSource;
  }

  /**
   * Removes a DragListener added by createDragSource() so the corresponding
   * DOM element is not a drag source any more.
   */
  removeDragSource(dragSource: DragSource): void {
    removeFromArray(dragSource, this._dragSources);
    dragSource.destroy();
  }

  /** @internal */
  startComponentDrag(
    x: number,
    y: number,
    dragListener: DragListener,
    componentItem: ComponentItem,
    originalParent: ContentItem,
  ): HTMLElement {
    if (this._activeDragProxy !== undefined) {
      throw new Error('A drag proxy is already active');
    }
    const dragProxy = new DragProxy(
      x,
      y,
      dragListener,
      this,
      componentItem,
      originalParent,
      (finishedDragProxy) => {
        if (this._activeDragProxy === finishedDragProxy) {
          this._activeDragProxy = undefined;
        }
      },
    );
    this._activeDragProxy = dragProxy;
    return dragProxy.element;
  }

  /**
   * Programmatically focuses an item. This focuses the specified component item
   * and the item emits a focus event
   *
   * @param item - The component item to be focused
   * @param suppressEvent - Whether to emit focus event
   */
  focusComponent(item: ComponentItem, suppressEvent = false): void {
    item.focus(suppressEvent);
  }

  /**
   * Programmatically blurs (defocuses) the currently focused component.
   * If a component item is focused, then it is blurred and and the item emits a blur event
   *
   * @param suppressEvent - Whether to emit blur event
   */
  clearComponentFocus(suppressEvent = false): void {
    this.setFocusedComponentItem(undefined, suppressEvent);
  }

  /**
   * Programmatically focuses a component item or removes focus (blurs) from an existing focused component item.
   *
   * @param item - If defined, specifies the component item to be given focus.  If undefined, clear component focus.
   * @param suppressEvents - Whether to emit focus and blur events
   * @internal
   */
  setFocusedComponentItem(
    item: ComponentItem | undefined,
    suppressEvents = false,
  ): void {
    if (item !== this._focusedComponentItem) {
      let newFocusedParentItem: ComponentParentableItem | undefined;
      if (item === undefined) {
        newFocusedParentItem = undefined;
      } else {
        newFocusedParentItem = item.parentItem;
      }

      if (this._focusedComponentItem !== undefined) {
        const oldFocusedItem = this._focusedComponentItem;
        this._focusedComponentItem = undefined;
        oldFocusedItem.setBlurred(suppressEvents);
        const oldFocusedParentItem = oldFocusedItem.parentItem;
        if (newFocusedParentItem === oldFocusedParentItem) {
          newFocusedParentItem = undefined;
        } else {
          oldFocusedParentItem.setFocusedValue(false);
        }
      }

      if (item !== undefined) {
        this._focusedComponentItem = item;
        item.setFocused(suppressEvents);
        if (newFocusedParentItem !== undefined) {
          newFocusedParentItem.setFocusedValue(true);
        }
      }
    }
  }

  /** @internal */
  private createContentItemFromConfig(
    config: ResolvedItemConfig,
    parent: ContentItem,
  ): ContentItem {
    switch (config.type) {
      case ItemType.ground:
        throw new AssertError('LMCCIFC68871');
      case ItemType.row:
        return new RowOrColumn(
          false,
          this,
          config as ResolvedRowOrColumnItemConfig,
          parent,
        );
      case ItemType.column:
        return new RowOrColumn(
          true,
          this,
          config as ResolvedRowOrColumnItemConfig,
          parent,
        );
      case ItemType.stack:
        return new Stack(this, config as ResolvedStackItemConfig, parent);
      case ItemType.component:
        return new ComponentItem(
          this,
          config as ResolvedComponentItemConfig,
          parent as Stack,
        );
      default:
        throw new UnreachableCaseError(
          'CCC913564',
          config.type,
          'Invalid Config Item type specified',
        );
    }
  }

  /**
   * This should only be called from stack component.
   * Stack will look after docking processing associated with maximise/minimise
   * @internal
   **/
  setMaximisedStack(stack: Stack | undefined): void {
    if (stack === undefined) {
      if (this._maximisedStack !== undefined) {
        this.processMinimiseMaximisedStack();
      }
    } else {
      if (stack !== this._maximisedStack) {
        if (this._maximisedStack !== undefined) {
          this.processMinimiseMaximisedStack();
        }

        this.processMaximiseStack(stack);
      }
    }
  }

  /** Performs the check minimise maximised stack operation. */
  checkMinimiseMaximisedStack(): void {
    if (this._maximisedStack !== undefined) {
      this._maximisedStack.minimise();
    }
  }

  // showAllActiveContentItems() was called from ContentItem.show().  Not sure what its purpose was so have commented out
  // Everything seems to work ok without this.  Have left commented code just in case there was a reason for it becomes
  // apparent

  // /** @internal */
  // showAllActiveContentItems(): void {
  //     const allStacks = this.getAllStacks();

  //     for (let i = 0; i < allStacks.length; i++) {
  //         const stack = allStacks[i];
  //         const activeContentItem = stack.getActiveComponentItem();

  //         if (activeContentItem !== undefined) {
  //             if (!(activeContentItem instanceof ComponentItem)) {
  //                 throw new AssertError('LMSAACIS22298');
  //             } else {
  //                 activeContentItem.container.show();
  //             }
  //         }
  //     }
  // }

  // hideAllActiveContentItems() was called from ContentItem.hide().  Not sure what its purpose was so have commented out
  // Everything seems to work ok without this.  Have left commented code just in case there was a reason for it becomes
  // apparent

  // /** @internal */
  // hideAllActiveContentItems(): void {
  //     const allStacks = this.getAllStacks();

  //     for (let i = 0; i < allStacks.length; i++) {
  //         const stack = allStacks[i];
  //         const activeContentItem = stack.getActiveComponentItem();

  //         if (activeContentItem !== undefined) {
  //             if (!(activeContentItem instanceof ComponentItem)) {
  //                 throw new AssertError('LMSAACIH22298');
  //             } else {
  //                 activeContentItem.container.hide();
  //             }
  //         }
  //     }
  // }

  /** @internal */
  private cleanupBeforeMaximisedStackDestroyed(
    event: EventEmitterBubblingEvent,
  ) {
    if (
      this._maximisedStack !== undefined &&
      this._maximisedStack === event.target
    ) {
      this._maximisedStack.off(
        'beforeItemDestroyed',
        this._maximisedStackBeforeDestroyedListener,
      );
      this._maximisedStack = undefined;
    }
  }

  /**
   * This method is used to get around sandboxed iframe restrictions.
   * If 'allow-top-navigation' is not specified in the iframe's 'sandbox' attribute
   * (as is the case with codepens) the parent window is forbidden from calling certain
   * methods on the child, such as window.close() or setting document.location.href.
   *
   * This prevented StrelitLayout popouts from popping in in codepens. The fix is to call
   * _$closeWindow on the child window's gl instance which (after a timeout to disconnect
   * the invoking method from the close call) closes itself.
   *
   * @internal
   */
  closeWindow(): void {
    globalThis.setTimeout(() => globalThis.close(), 1);
  }

  /** @internal */
  getArea(x: number, y: number): ContentItemArea | null {
    let matchingArea = null;
    let smallestSurface = Infinity;

    for (let i = 0; i < this._itemAreas.length; i++) {
      const area = this._itemAreas[i];

      if (
        x >= area.x1 &&
        x < area.x2 && // x2 is not included in area
        y >= area.y1 &&
        y < area.y2 && // y2 is not included in area
        smallestSurface > area.surface
      ) {
        smallestSurface = area.surface;
        matchingArea = area;
      }
    }

    return matchingArea;
  }

  /** @internal */
  calculateItemAreas(): void {
    const allContentItems = this.getAllContentItems();
    /**
     * If the last item is dragged out, highlight the entire container size to
     * allow to re-drop it. this.ground.contentiItems.length === 0 at this point
     *
     * Don't include ground into the possible drop areas though otherwise since it
     * will used for every gap in the layout, e.g. splitters
     */
    const groundItem = this._groundItem;
    if (groundItem === undefined) {
      throw new UnexpectedUndefinedError('LMCIAR44365');
    } else {
      if (allContentItems.length === 1) {
        // No root ContentItem (just Ground ContentItem)
        const groundArea = groundItem.getElementArea();
        if (groundArea === null) {
          throw new UnexpectedNullError('LMCIARA44365');
        } else {
          this._itemAreas = [groundArea];
        }
        return;
      } else {
        if (groundItem.contentItems[0].isStack) {
          // if root is Stack, then split stack and sides of Layout are same, so skip sides
          this._itemAreas = [];
        } else {
          // sides of layout
          this._itemAreas = groundItem.createSideAreas();
        }

        for (let i = 0; i < allContentItems.length; i++) {
          const stack = allContentItems[i];
          if (ContentItem.isStack(stack)) {
            const area = stack.getArea();

            if (area === null) {
              continue;
            } else {
              this._itemAreas.push(area);
              const stackContentAreaDimensions = stack.contentAreaDimensions;
              if (stackContentAreaDimensions === undefined) {
                throw new UnexpectedUndefinedError('LMCIASC45599');
              } else {
                const highlightArea =
                  stackContentAreaDimensions.header.highlightArea;
                const surface =
                  (highlightArea.x2 - highlightArea.x1) *
                  (highlightArea.y2 - highlightArea.y1);

                const header: ContentItemArea = {
                  x1: highlightArea.x1,
                  x2: highlightArea.x2,
                  y1: highlightArea.y1,
                  y2: highlightArea.y2,
                  contentItem: stack,
                  surface,
                };
                this._itemAreas.push(header);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Called as part of loading a new layout (including initial init()).
   * Checks to see layout has a maximised item. If so, it maximises that item.
   * @internal
   */
  private checkLoadedLayoutMaximiseItem() {
    if (this._groundItem === undefined) {
      throw new UnexpectedUndefinedError('LMCLLMI43432');
    } else {
      const configMaximisedItems = this._groundItem.getConfigMaximisedItems();

      if (configMaximisedItems.length > 0) {
        let item = configMaximisedItems[0];
        if (ContentItem.isComponentItem(item)) {
          const stack = item.parent;
          if (stack === null) {
            throw new UnexpectedNullError('LMXLLMI69999');
          } else {
            item = stack;
          }
        }
        if (!ContentItem.isStack(item)) {
          throw new AssertError('LMCLLMI19993');
        } else {
          item.maximise();
        }
      }
    }
  }

  /** @internal */
  private processMaximiseStack(stack: Stack): void {
    this._maximisedStack = stack;
    stack.on(
      'beforeItemDestroyed',
      this._maximisedStackBeforeDestroyedListener,
    );
    stack.element.classList.add(DomConstants.ClassName.Maximised);
    stack.element.insertAdjacentElement('afterend', this._maximisePlaceholder);
    if (this._groundItem === undefined) {
      throw new UnexpectedUndefinedError('LMMXI19993');
    } else {
      this._groundItem.element.prepend(stack.element);
      const { width, height } = getElementWidthAndHeight(
        this._containerElement,
      );
      setElementWidth(stack.element, width);
      setElementHeight(stack.element, height);
      stack.updateSize(true);
      stack.focusActiveContentItem();
      this._maximisedStack.emit('maximised');
      this.emit('stateChanged');
    }
  }

  /** @internal */
  private processMinimiseMaximisedStack(): void {
    if (this._maximisedStack === undefined) {
      throw new AssertError('LMMMS74422');
    } else {
      const stack = this._maximisedStack;
      if (stack.parent === null) {
        throw new UnexpectedNullError('LMMI13668');
      } else {
        stack.element.classList.remove(DomConstants.ClassName.Maximised);
        if (this._maximisePlaceholder.isConnected) {
          this._maximisePlaceholder.insertAdjacentElement(
            'afterend',
            stack.element,
          );
          this._maximisePlaceholder.remove();
        } else {
          stack.parent.element.appendChild(stack.element);
        }
        this.updateRootSize(true);
        this._maximisedStack = undefined;
        stack.off(
          'beforeItemDestroyed',
          this._maximisedStackBeforeDestroyedListener,
        );
        stack.emit('minimised');
        this.emit('stateChanged');
      }
    }
  }

  /**
   * Iterates through the array of open popout windows and removes the ones
   * that are effectively closed. This is necessary due to the lack of reliably
   * listening for window.close / unload events in a cross browser compatible fashion.
   * @internal
   */
  private reconcilePopoutWindows() {
    if (this._isDestroyed) {
      return;
    }
    const openPopouts: BrowserPopout[] = [];

    for (const element of this._openPopouts) {
      try {
        if (!element.getWindow().closed) {
          openPopouts.push(element);
        } else if (element.closedWithFailedPopIn) {
          openPopouts.push(element);
        } else {
          this.emit('windowClosed', element);
        }
      } catch {
        // Configured popouts remain serializable when popup creation is blocked.
        openPopouts.push(element);
      }
    }

    if (this._openPopouts.length !== openPopouts.length) {
      this._openPopouts = openPopouts;
      this.emit('stateChanged');
    }
  }

  /**
   * Returns a flattened array of all content items,
   * regardles of level or type
   * @internal
   */
  private getAllContentItems() {
    if (this._groundItem === undefined) {
      throw new UnexpectedUndefinedError('LMGACI13130');
    } else {
      return this._groundItem.getAllContentItems();
    }
  }

  /**
   * Creates Subwindows (if there are any). Throws an error
   * if popouts are blocked.
   * @internal
   */
  private createSubWindows() {
    for (const element of this.layoutConfig.openPopouts) {
      const popoutConfig = element;
      const browserPopout =
        this.createPopoutFromPopoutLayoutConfig(popoutConfig);
      if (!this._openPopouts.includes(browserPopout)) {
        this._openPopouts.push(browserPopout);
      }
    }
  }

  /**
   * Debounces resize events
   * @internal
   */
  private handleContainerResize(): void {
    if (this.resizeWithContainerAutomatically) {
      this.processResizeWithDebounce();
    }
  }

  /**
   * Debounces resize events
   * @internal
   */
  private processResizeWithDebounce(): void {
    if (this.resizeDebounceExtendedWhenPossible) {
      this.checkClearResizeTimeout();
    }

    if (this._resizeTimeoutId === undefined) {
      this._resizeTimeoutId = setTimeout(() => {
        this._resizeTimeoutId = undefined;
        this.beginSizeInvalidation();
        this.endSizeInvalidation();
      }, this.resizeDebounceInterval);
    }
  }

  private checkClearResizeTimeout() {
    if (this._resizeTimeoutId !== undefined) {
      clearTimeout(this._resizeTimeoutId);
      this._resizeTimeoutId = undefined;
    }
  }

  /**
   * Determines what element the layout will be created in
   * @internal
   */
  private setContainer() {
    const bodyElement = document.body;
    const containerElement = this._containerElement ?? bodyElement;

    if (containerElement === bodyElement) {
      this.resizeWithContainerAutomatically = true;

      const documentElement = document.documentElement;
      const ownership = bodyContainerStyleOwnership.get(document);
      if (ownership === undefined) {
        bodyContainerStyleOwnership.set(document, {
          count: 1,
          snapshots: [
            this.captureInlineStyle(documentElement),
            this.captureInlineStyle(bodyElement),
          ],
        });
      } else {
        ownership.count++;
      }
      this._ownsBodyContainerStyles = true;
      documentElement.style.height = '100%';
      documentElement.style.margin = '0';
      documentElement.style.padding = '0';
      documentElement.style.overflow = 'clip';
      bodyElement.style.height = '100%';
      bodyElement.style.margin = '0';
      bodyElement.style.padding = '0';
      bodyElement.style.overflow = 'clip';
    }

    this._containerElement = containerElement;
  }

  private captureInlineStyle(element: HTMLElement): InlineStyleSnapshot {
    return {
      element,
      properties: bodyContainerStyleProperties.map((name) => ({
        name,
        priority: element.style.getPropertyPriority(name),
        value: element.style.getPropertyValue(name),
      })),
    };
  }

  private restoreBodyContainerStyles(): void {
    if (!this._ownsBodyContainerStyles) {
      return;
    }
    this._ownsBodyContainerStyles = false;
    const ownership = bodyContainerStyleOwnership.get(document);
    if (ownership === undefined || --ownership.count > 0) {
      return;
    }
    for (const snapshot of ownership.snapshots) {
      for (const property of snapshot.properties) {
        if (property.value === '') {
          snapshot.element.style.removeProperty(property.name);
        } else {
          snapshot.element.style.setProperty(
            property.name,
            property.value,
            property.priority,
          );
        }
      }
    }
    bodyContainerStyleOwnership.delete(document);
  }

  private onBeforeUnload(): void {
    this.destroy();
  }

  /**
   * Adjusts the number of columns to be lower to fit the screen and still maintain minItemWidth.
   * @internal
   */
  private adjustColumnsResponsive() {
    if (this._groundItem === undefined) {
      throw new UnexpectedUndefinedError('LMACR20883');
    } else {
      const useResponsive = this.useResponsiveLayout();
      // If there is no min width set, or not content items, do nothing.
      if (
        useResponsive &&
        !this._updatingColumnsResponsive &&
        this._groundItem.contentItems.length > 0 &&
        this._groundItem.contentItems[0].isRow
      ) {
        if (this._groundItem === undefined || this._width === null) {
          throw new UnexpectedUndefinedError('LMACR77412');
        } else {
          // If there is only one column, do nothing.
          const columnCount =
            this._groundItem.contentItems[0].contentItems.length;
          if (columnCount <= 1) {
            if (this._groundItem.contentItems.length > 0) {
              this._firstLoad = false;
            }
            return;
          } else {
            // If they all still fit, do nothing.
            const minItemWidth =
              this.layoutConfig.dimensions.defaultMinItemWidth;
            const totalMinWidth = columnCount * minItemWidth;
            if (totalMinWidth <= this._width) {
              if (this._groundItem.contentItems.length > 0) {
                this._firstLoad = false;
              }
              return;
            } else {
              // Prevent updates while it is already happening.
              this._updatingColumnsResponsive = true;

              // Figure out how many columns to stack, and put them all in the first stack container.
              const finalColumnCount = Math.max(
                Math.floor(this._width / minItemWidth),
                1,
              );
              const stackColumnCount = columnCount - finalColumnCount;

              const rootContentItem = this._groundItem.contentItems[0];
              const rootBranches = [...rootContentItem.contentItems];
              let firstStackContainer: Stack | undefined;
              let destinationBranch: ContentItem | undefined;
              for (const branch of rootBranches) {
                const branchStacks = branch.getItemsByType(
                  ItemType.stack,
                ) as Stack[];
                if (branchStacks.length > 0) {
                  firstStackContainer = branchStacks[0];
                  destinationBranch = branch;
                  break;
                }
              }
              if (
                firstStackContainer === undefined ||
                destinationBranch === undefined
              ) {
                this._updatingColumnsResponsive = false;
                throw new AssertError('LMACRS77413');
              } else {
                const columnsToCollapse = rootBranches
                  .filter((branch) => branch !== destinationBranch)
                  .slice(-stackColumnCount);
                try {
                  for (const column of columnsToCollapse) {
                    this.addChildContentItemsToContainer(
                      firstStackContainer,
                      column,
                    );
                    if (rootContentItem.contentItems.includes(column)) {
                      rootContentItem.removeChild(column);
                    }
                  }
                } finally {
                  this._updatingColumnsResponsive = false;
                }
              }
            }
          }
        }
      }
      if (this._groundItem.contentItems.length > 0) {
        this._firstLoad = false;
      }
    }
  }

  /**
   * Determines if responsive layout should be used.
   *
   * @returns True if responsive layout should be used; otherwise false.
   * @internal
   */
  private useResponsiveLayout() {
    const settings = this.layoutConfig.settings;
    const alwaysResponsiveMode =
      settings.responsiveMode === ResponsiveMode.always;
    const onLoadResponsiveModeAndFirst =
      settings.responsiveMode === ResponsiveMode.onload && this._firstLoad;
    return alwaysResponsiveMode || onLoadResponsiveModeAndFirst;
  }

  /**
   * Adds all children of a node to another container recursively.
   * @param container - Container to add child content items to.
   * @param node - Node to search for content items.
   * @internal
   */
  private addChildContentItemsToContainer(
    container: ContentItem,
    node: ContentItem,
  ) {
    if (node instanceof Stack) {
      while (node.contentItems.length > 0) {
        const item = node.contentItems[0];
        node.removeChild(item, true);
        container.addChild(item);
      }
    } else {
      const items = [...node.contentItems];
      for (let i = 0; i < items.length; i++) {
        this.addChildContentItemsToContainer(container, items[i]);
      }
    }
  }

  /**
   * Finds all the stacks.
   * @returns The found stack containers.
   * @internal
   */
  private getAllStacks() {
    if (this._groundItem === undefined) {
      throw new UnexpectedUndefinedError('LMFASC52778');
    } else {
      const stacks: Stack[] = [];
      this.findAllStacksRecursive(stacks, this._groundItem);

      return stacks;
    }
  }

  /** @internal */
  private findFirstContentItemType(type: ItemType): ContentItem | undefined {
    if (this._groundItem === undefined) {
      throw new UnexpectedUndefinedError('LMFFCIT82446');
    } else {
      return this.findFirstContentItemTypeRecursive(type, this._groundItem);
    }
  }

  /** @internal */
  private findFirstContentItemTypeRecursive(
    type: ItemType,
    node: ContentItem,
  ): ContentItem | undefined {
    const contentItems = node.contentItems;
    const contentItemCount = contentItems.length;
    if (contentItemCount === 0) {
      return undefined;
    } else {
      for (let i = 0; i < contentItemCount; i++) {
        const contentItem = contentItems[i];
        if (contentItem.type === type) {
          return contentItem;
        }
      }

      for (let i = 0; i < contentItemCount; i++) {
        const contentItem = contentItems[i];
        const foundContentItem = this.findFirstContentItemTypeRecursive(
          type,
          contentItem,
        );
        if (foundContentItem !== undefined) {
          return foundContentItem;
        }
      }

      return undefined;
    }
  }

  /** @internal */
  private findFirstContentItemTypeByIdRecursive(
    type: ItemType,
    id: string,
    node: ContentItem,
  ): ContentItem | undefined {
    const contentItems = node.contentItems;
    const contentItemCount = contentItems.length;
    if (contentItemCount === 0) {
      return undefined;
    } else {
      for (let i = 0; i < contentItemCount; i++) {
        const contentItem = contentItems[i];
        if (contentItem.type === type && contentItem.id === id) {
          return contentItem;
        }
      }

      for (let i = 0; i < contentItemCount; i++) {
        const contentItem = contentItems[i];
        const foundContentItem = this.findFirstContentItemTypeByIdRecursive(
          type,
          id,
          contentItem,
        );
        if (foundContentItem !== undefined) {
          return foundContentItem;
        }
      }

      return undefined;
    }
  }

  /**
   * Finds all the stack containers.
   *
   * @param stacks - Set of containers to populate.
   * @param node - Current node to process.
   * @internal
   */
  private findAllStacksRecursive(stacks: Stack[], node: ContentItem) {
    const contentItems = node.contentItems;
    for (let i = 0; i < contentItems.length; i++) {
      const item = contentItems[i];
      if (item instanceof Stack) {
        stacks.push(item);
      } else {
        if (!item.isComponent) {
          this.findAllStacksRecursive(stacks, item);
        }
      }
    }
  }

  /** @internal */
  private findFirstLocation(
    selectors: readonly LayoutManagerLocationSelector[],
    itemConfig?: RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig,
  ): LayoutManagerLocation | undefined {
    const count = selectors.length;
    for (let i = 0; i < count; i++) {
      const selector = selectors[i];
      if (
        itemConfig !== undefined &&
        !isComponentItemConfig(itemConfig) &&
        selector.typeId === LayoutManagerLocationSelectorTypeId.Root &&
        this._groundItem !== undefined
      ) {
        const rootItem = this._groundItem.contentItems[0];
        if (rootItem?.isStack || rootItem?.isComponent) {
          if (
            selector.index === undefined ||
            selector.index === 0 ||
            selector.index === 1
          ) {
            return {
              parentItem: this._groundItem,
              index: selector.index ?? 1,
            };
          }
          continue;
        }
      }
      const location = this.findLocation(selector);
      if (location !== undefined) {
        if (
          itemConfig !== undefined &&
          !isComponentItemConfig(itemConfig) &&
          location.parentItem.type === ItemType.stack
        ) {
          continue;
        }
        return location;
      }
    }
    return undefined;
  }

  /** @internal */
  private findLocation(
    selector: LayoutManagerLocationSelector,
  ): LayoutManagerLocation | undefined {
    const selectorIndex = selector.index;
    switch (selector.typeId) {
      case LayoutManagerLocationSelectorTypeId.FocusedItem: {
        if (this._focusedComponentItem === undefined) {
          return undefined;
        } else {
          const parentItem = this._focusedComponentItem.parentItem;
          const parentContentItems = parentItem.contentItems;
          const parentContentItemCount = parentContentItems.length;
          if (selectorIndex === undefined) {
            return { parentItem, index: parentContentItemCount };
          } else {
            const focusedIndex = parentContentItems.indexOf(
              this._focusedComponentItem,
            );
            const index = focusedIndex + selectorIndex;
            if (index < 0 || index > parentContentItemCount) {
              return undefined;
            } else {
              return { parentItem, index };
            }
          }
        }
      }
      case LayoutManagerLocationSelectorTypeId.FocusedStack: {
        if (this._focusedComponentItem === undefined) {
          return undefined;
        } else {
          const parentItem = this._focusedComponentItem.parentItem;
          return this.tryCreateLocationFromParentItem(
            parentItem,
            selectorIndex,
          );
        }
      }
      case LayoutManagerLocationSelectorTypeId.FirstStack: {
        const parentItem = this.findFirstContentItemType(ItemType.stack);
        if (parentItem === undefined) {
          return undefined;
        } else {
          return this.tryCreateLocationFromParentItem(
            parentItem,
            selectorIndex,
          );
        }
      }
      case LayoutManagerLocationSelectorTypeId.FirstRowOrColumn: {
        let parentItem = this.findFirstContentItemType(ItemType.row);
        if (parentItem !== undefined) {
          return this.tryCreateLocationFromParentItem(
            parentItem,
            selectorIndex,
          );
        } else {
          parentItem = this.findFirstContentItemType(ItemType.column);
          if (parentItem !== undefined) {
            return this.tryCreateLocationFromParentItem(
              parentItem,
              selectorIndex,
            );
          } else {
            return undefined;
          }
        }
      }
      case LayoutManagerLocationSelectorTypeId.FirstRow: {
        const parentItem = this.findFirstContentItemType(ItemType.row);
        if (parentItem === undefined) {
          return undefined;
        } else {
          return this.tryCreateLocationFromParentItem(
            parentItem,
            selectorIndex,
          );
        }
      }
      case LayoutManagerLocationSelectorTypeId.FirstColumn: {
        const parentItem = this.findFirstContentItemType(ItemType.column);
        if (parentItem === undefined) {
          return undefined;
        } else {
          return this.tryCreateLocationFromParentItem(
            parentItem,
            selectorIndex,
          );
        }
      }
      case LayoutManagerLocationSelectorTypeId.Empty: {
        if (this._groundItem === undefined) {
          throw new UnexpectedUndefinedError('LMFLRIF18244');
        }
        if (this.rootItem !== undefined) {
          return undefined;
        }
        if (selectorIndex === undefined || selectorIndex === 0)
          return { parentItem: this._groundItem, index: 0 };
        return undefined;
      }
      case LayoutManagerLocationSelectorTypeId.Root: {
        if (this._groundItem === undefined) {
          throw new UnexpectedUndefinedError('LMFLF18244');
        } else {
          const groundContentItems = this._groundItem.contentItems;
          if (groundContentItems.length === 0) {
            if (selectorIndex === undefined || selectorIndex === 0)
              return { parentItem: this._groundItem, index: 0 };
            else {
              return undefined;
            }
          } else {
            const parentItem = groundContentItems[0];
            return this.tryCreateLocationFromParentItem(
              parentItem,
              selectorIndex,
            );
          }
        }
      }
    }
  }

  /** @internal */
  private tryCreateLocationFromParentItem(
    parentItem: ContentItem,
    selectorIndex: number | undefined,
  ): LayoutManagerLocation | undefined {
    const parentContentItems = parentItem.contentItems;
    const parentContentItemCount = parentContentItems.length;
    if (selectorIndex === undefined) {
      return { parentItem, index: parentContentItemCount };
    } else {
      if (selectorIndex < 0 || selectorIndex > parentContentItemCount) {
        return undefined;
      } else {
        return { parentItem, index: selectorIndex };
      }
    }
  }
}

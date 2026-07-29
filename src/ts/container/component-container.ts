import {
  type ComponentItemConfig,
  isComponentItemConfig,
  resolveItemConfigWithComponentReorderEnabledDefault,
} from '../config/config';
import { ResolvedComponentItemConfig } from '../config/resolved-config';
import { Tab } from '../controls/tab';
import { AssertError, UnexpectedNullError } from '../errors/internal-error';
import { ComponentItem } from '../items/component-item';
import { ContentItem } from '../items/content-item';
import { LayoutManager } from '../layout-manager';
import { EventEmitter } from '../utils/event-emitter';
import {
  ComponentType,
  LogicalZIndex,
  LogicalZIndexToDefaultMap,
  SerializableValue,
  SizeUnit,
} from '../utils/types';
import {
  deepCloneValue,
  getElementHeight,
  getElementWidth,
  setElementHeight,
  setElementWidth,
} from '../utils/utils';

/**
 * Represents component container component.
 * @public
 */
export type ComponentContainerComponent = object;
/**
 * Defines the component container bindable component contract.
 * @public
 */
export interface ComponentContainerBindableComponent {
  /** The component. */
  component: ComponentContainerComponent | undefined;
  /** The virtual. */
  virtual: boolean;
}
/**
 * Represents component container state request event handler.
 * @public
 */
export type ComponentContainerStateRequestEventHandler = (
  this: void,
) => SerializableValue | undefined;
/**
 * Represents component container virtual recting required event.
 * @public
 */
export type ComponentContainerVirtualRectingRequiredEvent = (
  this: void,
  container: ComponentContainer,
  width: number,
  height: number,
) => void;
/**
 * Represents component container virtual visibility change required event.
 * @public
 */
export type ComponentContainerVirtualVisibilityChangeRequiredEvent = (
  this: void,
  container: ComponentContainer,
  visible: boolean,
) => void;
/**
 * Represents component container virtual zindex change required event.
 * @public
 */
export type ComponentContainerVirtualZIndexChangeRequiredEvent = (
  this: void,
  container: ComponentContainer,
  logicalZIndex: LogicalZIndex,
  defaultZIndex: string,
) => void;
/** Represents component container show event handler. */
export type ComponentContainerShowEventHandler = (this: void) => void;
/** Represents component container hide event handler. */
export type ComponentContainerHideEventHandler = (this: void) => void;
/** Represents component container focus event handler. */
export type ComponentContainerFocusEventHandler = (
  this: void,
  suppressEvent: boolean,
) => void;
/** Represents component container blur event handler. */
export type ComponentContainerBlurEventHandler = (
  this: void,
  suppressEvent: boolean,
) => void;
/** Represents component container update item config event handler. */
export type ComponentContainerUpdateItemConfigEventHandler = (
  itemConfig: ResolvedComponentItemConfig,
) => void;

/**
 * Provides component container behavior.
 * @public
 */
export class ComponentContainer extends EventEmitter {
  /** @internal */
  private _componentType: ComponentType;
  /** @internal */
  private _boundComponent: ComponentContainerBindableComponent;
  /** @internal */
  private _width: number;
  /** @internal */
  private _height: number;
  /** @internal */
  private _isClosable;
  /** @internal */
  private _initialState: SerializableValue | undefined;
  /** @internal */
  private _state: SerializableValue | undefined;
  /** @internal */
  private _visible;
  /** @internal */
  private _isShownWithZeroDimensions;
  /** @internal */
  private _tab!: Tab;
  /** @internal */
  private _stackMaximised = false;
  /** @internal */
  private _logicalZIndex!: LogicalZIndex;

  /** The state request event. */
  stateRequestEvent: ComponentContainerStateRequestEventHandler | undefined;
  /** The virtual recting required event. */
  virtualRectingRequiredEvent:
    ComponentContainerVirtualRectingRequiredEvent | undefined;
  /** The virtual visibility change required event. */
  virtualVisibilityChangeRequiredEvent:
    ComponentContainerVirtualVisibilityChangeRequiredEvent | undefined;
  /** The virtual zindex change required event. */
  virtualZIndexChangeRequiredEvent:
    ComponentContainerVirtualZIndexChangeRequiredEvent | undefined;

  /** Gets the width. */
  get width(): number {
    return this._width;
  }
  /** Gets the height. */
  get height(): number {
    return this._height;
  }
  /** Gets the parent. */
  get parent(): ComponentItem {
    return this._parent;
  }
  /** Gets the component type. */
  get componentType(): ComponentType {
    return this._componentType;
  }
  /** Gets the virtual. */
  get virtual(): boolean {
    return this._boundComponent.virtual;
  }
  /** Gets the component. */
  get component(): ComponentContainerComponent | undefined {
    return this._boundComponent.component;
  }
  /** Gets the tab. */
  get tab(): Tab {
    return this._tab;
  }
  /** Gets the title. */
  get title(): string {
    return this._parent.title;
  }
  /** Gets the layout manager. */
  get layoutManager(): LayoutManager {
    return this._layoutManager;
  }
  /** Gets the is hidden. */
  get isHidden(): boolean {
    return !this._visible;
  }
  /** Gets the visible. */
  get visible(): boolean {
    return this._visible;
  }
  /** Gets the state. */
  get state(): SerializableValue | undefined {
    return this._state;
  }
  /** Return the initial component state */
  get initialState(): SerializableValue | undefined {
    return this._initialState;
  }
  /** The inner DOM element where the container's content is intended to live in */
  get element(): HTMLElement {
    return this._element;
  }

  /** @internal */
  constructor(
    /** @internal */
    private readonly _config: ResolvedComponentItemConfig,
    /** @internal */
    private readonly _parent: ComponentItem,
    /** @internal */
    private readonly _layoutManager: LayoutManager,
    /** @internal */
    private readonly _element: HTMLElement,
    /** @internal */
    private readonly _updateItemConfigEvent: ComponentContainerUpdateItemConfigEventHandler,
    /** @internal */
    private readonly _showEvent: ComponentContainerShowEventHandler,
    /** @internal */
    private readonly _hideEvent: ComponentContainerHideEventHandler,
    /** @internal */
    private readonly _focusEvent: ComponentContainerFocusEventHandler,
    /** @internal */
    private readonly _blurEvent: ComponentContainerBlurEventHandler,
  ) {
    super();

    this._width = 0;
    this._height = 0;
    this._visible = true;
    this._isShownWithZeroDimensions = true;

    this._componentType = _config.componentType;
    this._isClosable = _config.isClosable;
    this._initialState = deepCloneValue(_config.componentState) as
      SerializableValue | undefined;
    this._state = this._initialState;

    this._boundComponent = this.layoutManager.bindComponent(this, _config);

    this.updateElementPositionPropertyFromBoundComponent();
  }

  /** @internal */
  destroy(): void {
    this.releaseComponent();
    this.stateRequestEvent = undefined;
    this.virtualRectingRequiredEvent = undefined;
    this.virtualVisibilityChangeRequiredEvent = undefined;
    this.virtualZIndexChangeRequiredEvent = undefined;
    this.emit('destroy');
  }

  /**
   * Hides the container's component item (and hence, the container) if not already hidden.
   * Emits hide event prior to hiding the container.
   */
  hide(): void {
    this._hideEvent();
  }

  /**
   * Shows the container's component item (and hence, the container) if not visible.
   * Emits show event prior to hiding the container.
   */
  show(): void {
    this._showEvent();
  }

  /**
   * Focus this component in Layout.
   */
  focus(suppressEvent = false): void {
    this._focusEvent(suppressEvent);
  }

  /**
   * Remove focus from this component in Layout.
   */
  blur(suppressEvent = false): void {
    this._blurEvent(suppressEvent);
  }

  /**
   * Set the size from within the container. Traverses up
   * the item tree until it finds a row or column element
   * and resizes its items accordingly.
   *
   * If this container isn't a descendant of a row or column
   * it returns false
   * @param width - The new width in pixel
   * @param height - The new height in pixel
   *
   * @returns resizeSuccesful
   *
   * @internal
   */
  setSize(width: number, height: number): boolean {
    let ancestorItem: ContentItem | null = this._parent;
    if (
      ancestorItem.isColumn ||
      ancestorItem.isRow ||
      ancestorItem.parent === null
    ) {
      throw new AssertError(
        'ICSSPRC',
        'ComponentContainer cannot have RowColumn Parent',
      );
    } else {
      let ancestorChildItem: ContentItem;
      do {
        ancestorChildItem = ancestorItem;
        ancestorItem = ancestorItem.parent;
      } while (
        ancestorItem !== null &&
        !ancestorItem.isColumn &&
        !ancestorItem.isRow
      );

      if (ancestorItem === null) {
        // no Row or Column found
        return false;
      } else {
        // ancestorItem is Row or Column
        const direction = ancestorItem.isColumn ? 'height' : 'width';
        const currentSize = this[direction];
        if (currentSize === null) {
          throw new UnexpectedNullError('ICSSCS11194');
        } else {
          const newSize = direction === 'height' ? height : width;
          const siblingCount = ancestorItem.contentItems.length - 1;
          if (
            currentSize <= 0 ||
            ancestorChildItem.size <= 0 ||
            siblingCount <= 0 ||
            newSize < 0 ||
            !Number.isFinite(newSize)
          ) {
            return false;
          }

          const measuredOuterSize = ancestorItem.isColumn
            ? getElementHeight(ancestorChildItem.element)
            : getElementWidth(ancestorChildItem.element);
          const outerSize =
            measuredOuterSize > 0 ? measuredOuterSize : currentSize;
          const fixedOuterOffset = Math.max(0, outerSize - currentSize);
          const totalPixel = outerSize * (100 / ancestorChildItem.size);
          const percentage = ((newSize + fixedOuterOffset) / totalPixel) * 100;
          if (!Number.isFinite(percentage)) {
            return false;
          }
          const siblings = ancestorItem.contentItems.filter(
            (item) => item !== ancestorChildItem,
          );
          const dimensions = this.layoutManager.layoutConfig.dimensions;
          const defaultMinSize = ancestorItem.isColumn
            ? dimensions.defaultMinItemHeight
            : dimensions.defaultMinItemWidth;
          const getMinPercentage = (item: ContentItem) => {
            if (
              item.minSize !== undefined &&
              item.minSizeUnit !== SizeUnit.Pixel
            ) {
              return Number.POSITIVE_INFINITY;
            }
            return ((item.minSize ?? defaultMinSize) / totalPixel) * 100;
          };
          const targetMinPercentage = getMinPercentage(ancestorChildItem);
          if (percentage < targetMinPercentage) {
            return false;
          }
          const sizeIncrease = percentage - ancestorChildItem.size;
          if (sizeIncrease > 0) {
            const availableBySibling = siblings.map((item) =>
              Math.max(0, item.size - getMinPercentage(item)),
            );
            const totalAvailable = availableBySibling.reduce(
              (total, available) => total + available,
              0,
            );
            if (sizeIncrease > totalAvailable + 1e-10) {
              return false;
            }
            for (let i = 0; i < siblings.length; i++) {
              const reduction =
                totalAvailable === 0
                  ? 0
                  : sizeIncrease * (availableBySibling[i] / totalAvailable);
              siblings[i].size -= reduction;
            }
          } else {
            const releasedSize = -sizeIncrease;
            const siblingTotal = siblings.reduce(
              (total, item) => total + item.size,
              0,
            );
            for (const sibling of siblings) {
              sibling.size +=
                siblingTotal === 0
                  ? releasedSize / siblingCount
                  : releasedSize * (sibling.size / siblingTotal);
            }
          }
          ancestorChildItem.size = percentage;

          ancestorItem.updateSize(false);

          return true;
        }
      }
    }
  }

  /**
   * Closes the container if it is closable. Can be called by
   * both the component within at as well as the contentItem containing
   * it. Emits a close event before the container itself is closed.
   */
  close(): void {
    if (this._isClosable) {
      this.emit('close');
      this._parent.close();
    }
  }

  /** Replaces component without affecting layout */
  replaceComponent(itemConfig: ComponentItemConfig): void {
    if (!isComponentItemConfig(itemConfig)) {
      throw new Error('ReplaceComponent not passed a component ItemConfig');
    } else {
      const config = resolveItemConfigWithComponentReorderEnabledDefault(
        itemConfig,
        this.layoutManager.layoutConfig.settings.reorderEnabled,
      ) as ResolvedComponentItemConfig;
      const previousInitialState = this._initialState;
      const previousState = this._state;
      const previousComponentType = this._componentType;
      const previousStateRequestEvent = this.stateRequestEvent;
      const previousLiveState = deepCloneValue(
        previousStateRequestEvent === undefined
          ? previousState
          : previousStateRequestEvent(),
      ) as SerializableValue | undefined;
      const nextInitialState = deepCloneValue(config.componentState) as
        SerializableValue | undefined;
      let previousConfig: ResolvedComponentItemConfig;
      this.stateRequestEvent = undefined;
      try {
        previousConfig = {
          ...this._parent.toConfig(),
          componentType: previousComponentType,
          componentState: previousLiveState,
        };
      } finally {
        this.stateRequestEvent = previousStateRequestEvent;
      }

      this.releaseComponent();
      this.stateRequestEvent = undefined;
      this._initialState = nextInitialState;
      this._state = this._initialState;
      this._componentType = config.componentType;

      let nextBoundComponent: ComponentContainerBindableComponent;
      try {
        nextBoundComponent = this.layoutManager.bindComponent(this, config);
      } catch (error) {
        this.stateRequestEvent = previousStateRequestEvent;
        this._initialState = previousInitialState;
        this._state = previousLiveState;
        this._componentType = previousComponentType;
        try {
          this._boundComponent = this.layoutManager.bindComponent(
            this,
            previousConfig,
          );
        } catch {
          // If rollback fails, keep existing _boundComponent
        }
        throw error;
      }

      this._isClosable = config.isClosable;
      this._updateItemConfigEvent(config);

      this._boundComponent = nextBoundComponent;
      this.updateElementPositionPropertyFromBoundComponent();

      if (this._boundComponent.virtual) {
        if (this.virtualVisibilityChangeRequiredEvent !== undefined) {
          this.virtualVisibilityChangeRequiredEvent(this, this._visible);
        }
        if (this.virtualRectingRequiredEvent !== undefined) {
          this._layoutManager.fireBeforeVirtualRectingEvent(1, [this]);
          try {
            this.virtualRectingRequiredEvent(this, this._width, this._height);
          } finally {
            this._layoutManager.fireAfterVirtualRectingEvent();
          }
        }
        this.setBaseLogicalZIndex();
      }

      this.emit('stateChanged');
    }
  }

  /**
   * Set's the components title
   */
  setTitle(title: string): void {
    this._parent.setTitle(title);
  }

  /** @internal */
  setTab(tab: Tab): void {
    this._tab = tab;
    this.emit('tab', tab);
  }

  /** @internal */
  setVisibility(value: boolean): void {
    if (this._boundComponent.virtual) {
      if (this.virtualVisibilityChangeRequiredEvent !== undefined) {
        this.virtualVisibilityChangeRequiredEvent(this, value);
      }
    }

    if (value) {
      if (!this._visible) {
        this._visible = true;
        if (this._height === 0 && this._width === 0) {
          this._isShownWithZeroDimensions = true;
        } else {
          this._isShownWithZeroDimensions = false;
          this.setSizeToNodeSize(this._width, this._height, true);
          this.emitShow();
        }
      } else if (
        this._isShownWithZeroDimensions &&
        (this._height !== 0 || this._width !== 0)
      ) {
        this._isShownWithZeroDimensions = false;
        this.setSizeToNodeSize(this._width, this._height, true);
        this.emitShow();
      }
    } else if (this._visible) {
      this._visible = false;
      this._isShownWithZeroDimensions = false;
      this.emitHide();
    }
  }

  /** Sets base logical zindex. */
  setBaseLogicalZIndex(): void {
    this.setLogicalZIndex(LogicalZIndex.base);
  }

  /** Sets logical zindex. */
  setLogicalZIndex(logicalZIndex: LogicalZIndex): void {
    if (logicalZIndex !== this._logicalZIndex) {
      this._logicalZIndex = logicalZIndex;

      this.notifyVirtualZIndexChangeRequired();
    }
  }

  /**
   * Set the container's size, but considered temporary (for dragging)
   * so don't emit any events.
   * @internal
   */
  enterDragMode(width: number, height: number): void {
    this._width = width;
    this._height = height;
    setElementWidth(this._element, width);
    setElementHeight(this._element, height);

    this.setLogicalZIndex(LogicalZIndex.drag);

    this.drag();
  }

  /** @internal */
  exitDragMode(): void {
    this.setBaseLogicalZIndex();
  }

  /** @internal */
  enterStackMaximised(): void {
    this._stackMaximised = true;
    this.setLogicalZIndex(LogicalZIndex.stackMaximised);
  }

  /** @internal */
  exitStackMaximised(): void {
    this.setBaseLogicalZIndex();
    this._stackMaximised = false;
  }

  /** @internal */
  drag(): void {
    if (this._boundComponent.virtual) {
      if (this.virtualRectingRequiredEvent !== undefined) {
        this._layoutManager.fireBeforeVirtualRectingEvent(1, [this]);
        try {
          this.virtualRectingRequiredEvent(this, this._width, this._height);
        } finally {
          this._layoutManager.fireAfterVirtualRectingEvent();
        }
      }
    }
  }

  /**
   * Sets the container's size. Called by the container's component item.
   * To instead set the size programmatically from within the component itself,
   * use the public setSize method
   * @param width - in px
   * @param height - in px
   * @param force - set even if no change
   * @internal
   */
  setSizeToNodeSize(width: number, height: number, force: boolean): void {
    if (width !== this._width || height !== this._height || force) {
      this._width = width;
      this._height = height;
      setElementWidth(this._element, width);
      setElementHeight(this._element, height);

      if (this._boundComponent.virtual) {
        this.addVirtualSizedContainerToLayoutManager();
      } else {
        this.emit('resize');
        this.checkShownFromZeroDimensions();
      }
    }
  }

  /** @internal */
  notifyVirtualRectingRequired(): void {
    if (this.virtualRectingRequiredEvent !== undefined) {
      this.virtualRectingRequiredEvent(this, this._width, this._height);
      this.emit('resize');
      this.checkShownFromZeroDimensions();
    }
  }

  /** @internal */
  private notifyVirtualZIndexChangeRequired(): void {
    if (this.virtualZIndexChangeRequiredEvent !== undefined) {
      const logicalZIndex = this._logicalZIndex;
      const defaultZIndex = LogicalZIndexToDefaultMap[logicalZIndex];
      this.virtualZIndexChangeRequiredEvent(this, logicalZIndex, defaultZIndex);
    }
  }

  /** @internal */
  private updateElementPositionPropertyFromBoundComponent() {
    if (this._boundComponent.virtual) {
      this._element.style.position = 'static';
    } else {
      this._element.style.position = ''; // set it back to attribute value
    }
  }

  /** @internal */
  private addVirtualSizedContainerToLayoutManager() {
    this._layoutManager.beginVirtualSizedContainerAdding();
    try {
      this._layoutManager.addVirtualSizedContainer(this);
    } finally {
      this._layoutManager.endVirtualSizedContainerAdding();
    }
  }

  /** @internal */
  private checkShownFromZeroDimensions() {
    if (
      this._isShownWithZeroDimensions &&
      (this._height !== 0 || this._width !== 0)
    ) {
      this._isShownWithZeroDimensions = false;
      this.emitShow();
    }
  }

  /** @internal */
  private emitShow(): void {
    this.emit('show');
  }

  /** @internal */
  private emitHide(): void {
    this.emit('hide');
  }

  /** @internal */
  private releaseComponent() {
    if (this._stackMaximised) {
      this.exitStackMaximised();
    }
    this.emit('beforeComponentRelease', this._boundComponent.component);
    this.layoutManager.unbindComponent(
      this,
      this._boundComponent.virtual,
      this._boundComponent.component,
    );
  }
}

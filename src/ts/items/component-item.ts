import {
  createComponentTypeCopy,
  createResolvedHeaderedItemConfigHeaderCopy,
  type ResolvedComponentItemConfig,
  type ResolvedHeaderedItemConfigHeader,
} from '../config/resolved-config';
import {
  ComponentContainer,
  type ComponentContainerComponent,
} from '../container/component-container';
import { Tab } from '../controls/tab';
import { UnexpectedNullError } from '../errors/internal-error';
import { LayoutManager } from '../layout-manager';
import { DomConstants } from '../utils/dom-constants';
import { ComponentType, ItemType } from '../utils/types';
import {
  getElementWidthAndHeight,
  setElementHeight,
  setElementWidth,
} from '../utils/utils';
import { ComponentParentableItem } from './component-parentable-item';
import { ContentItem } from './content-item';

/**
 * Provides component item behavior.
 * @public
 */
export class ComponentItem extends ContentItem {
  /** @internal */
  private _reorderEnabled: boolean;
  /** @internal */
  private _headerConfig: ResolvedHeaderedItemConfigHeader | undefined;
  /** @internal */
  private _title!: string;
  /** @internal */
  private readonly _initialWantMaximise: boolean;
  /** @internal */
  private _container: ComponentContainer;
  /** @internal */
  private _tab!: Tab;
  /** @internal */
  private _focused = false;

  /** Gets the component type. */
  get componentType(): ComponentType {
    return this._container.componentType;
  }
  /** Gets the reorder enabled. */
  get reorderEnabled(): boolean {
    return this._reorderEnabled;
  }
  /** @internal */
  get initialWantMaximise(): boolean {
    return this._initialWantMaximise;
  }
  /** Gets the component. */
  get component(): ComponentContainerComponent | undefined {
    return this._container.component;
  }
  /** Gets the container. */
  get container(): ComponentContainer {
    return this._container;
  }
  /** Gets the parent item. */
  get parentItem(): ComponentParentableItem {
    return this._parentItem;
  }

  /** Gets the header config. */
  get headerConfig(): ResolvedHeaderedItemConfigHeader | undefined {
    return this._headerConfig;
  }
  /** Gets the title. */
  get title(): string {
    return this._title;
  }
  /** Gets the tab. */
  get tab(): Tab {
    return this._tab;
  }
  /** Gets the focused. */
  get focused(): boolean {
    return this._focused;
  }

  /** @internal */
  constructor(
    layoutManager: LayoutManager,
    config: ResolvedComponentItemConfig,
    /** @internal */
    private _parentItem: ComponentParentableItem,
  ) {
    super(layoutManager, config, _parentItem, document.createElement('div'));

    this.isComponent = true;

    this._reorderEnabled = config.reorderEnabled;

    this.applyUpdatableConfig(config);

    this._initialWantMaximise = config.maximised;

    const containerElement = document.createElement('div');
    containerElement.classList.add(DomConstants.ClassName.Content);
    this.element.appendChild(containerElement);
    this._container = new ComponentContainer(
      config,
      this,
      layoutManager,
      containerElement,
      (itemConfig) => this.handleUpdateItemConfigEvent(itemConfig),
      () => this.show(),
      () => this.hide(),
      (suppressEvent) => this.focus(suppressEvent),
      (suppressEvent) => this.blur(suppressEvent),
    );
  }

  /** @internal */
  override destroy(): void {
    if (this._isDestroyed) {
      return;
    }
    this._container.destroy();
    super.destroy();
  }

  /** Performs the apply updatable config operation. */
  applyUpdatableConfig(config: ResolvedComponentItemConfig): void {
    this.setTitle(config.title);
    this._headerConfig = config.header;
  }

  /** Performs the to config operation. */
  toConfig(): ResolvedComponentItemConfig {
    const stateRequestEvent = this._container.stateRequestEvent;
    const state =
      stateRequestEvent === undefined
        ? this._container.state
        : stateRequestEvent();

    const result: ResolvedComponentItemConfig = {
      type: ItemType.component,
      content: [],
      size: this.size,
      sizeUnit: this.sizeUnit,
      minSize: this.minSize,
      minSizeUnit: this.minSizeUnit,
      id: this.id,
      maximised: false,
      isClosable: this.isClosable,
      reorderEnabled: this._reorderEnabled,
      title: this._title,
      header: createResolvedHeaderedItemConfigHeaderCopy(this._headerConfig),
      componentType: createComponentTypeCopy(this.componentType),
      componentState: state,
    };

    return result;
  }

  /** Performs the close operation. */
  close(): void {
    if (this.parent === null) {
      throw new UnexpectedNullError('CIC68883');
    } else {
      this.parent.removeChild(this, false);
    }
  }

  // Used by Drag Proxy
  /** @internal */
  enterDragMode(width: number, height: number): void {
    setElementWidth(this.element, width);
    setElementHeight(this.element, height);
    this._container.enterDragMode(width, height);
  }

  /** @internal */
  exitDragMode(): void {
    this._container.exitDragMode();
  }

  /** @internal */
  enterStackMaximised(): void {
    this._container.enterStackMaximised();
  }

  /** @internal */
  exitStackMaximised(): void {
    this._container.exitStackMaximised();
  }

  // Used by Drag Proxy
  /** @internal */
  drag(): void {
    this._container.drag();
  }

  /** @internal */
  override updateSize(force: boolean): void {
    this.updateNodeSize(force);
  }

  /** @internal */
  override init(): void {
    this.updateNodeSize(false);

    super.init();
    this._container.emit('open');
    this.initContentItems();
  }

  /**
   * Set this component's title
   *
   * @public
   * @param title -
   */

  setTitle(title: string): void {
    this._title = title;
    this.emit('titleChanged', title);
    this.emitBaseBubblingEvent('stateChanged');
  }

  /** Sets tab. */
  setTab(tab: Tab): void {
    this._tab = tab;
    this.emit('tab', tab);
    this._container.setTab(tab);
  }

  /** @internal */
  override hide(): void {
    super.hide();
    this._container.setVisibility(false);
  }

  /** @internal */
  override show(): void {
    super.show();
    this._container.setVisibility(true);
  }

  /**
   * Focuses the item if it is not already focused
   */
  focus(suppressEvent = false): void {
    this.parentItem.setActiveComponentItem(this, true, suppressEvent);
  }

  /** @internal */
  setFocused(suppressEvent: boolean): void {
    this._focused = true;
    this.tab.setFocused();
    if (!suppressEvent) {
      this.emitBaseBubblingEvent('focus');
    }
  }

  /**
   * Blurs (defocuses) the item if it is focused
   */
  blur(suppressEvent = false): void {
    if (this._focused) {
      this.layoutManager.setFocusedComponentItem(undefined, suppressEvent);
    }
  }

  /** @internal */
  setBlurred(suppressEvent: boolean): void {
    this._focused = false;
    this.tab.setBlurred();
    if (!suppressEvent) {
      this.emitBaseBubblingEvent('blur');
    }
  }

  /** @internal */
  protected override setParent(parent: ContentItem): void {
    this._parentItem = parent as ComponentParentableItem;
    super.setParent(parent);
  }

  /** @internal */
  private handleUpdateItemConfigEvent(itemConfig: ResolvedComponentItemConfig) {
    this.applyUpdatableConfig(itemConfig);
  }

  /** @internal */
  private updateNodeSize(force: boolean): void {
    if (this.element.style.display !== 'none') {
      // Do not update size of hidden components to prevent unwanted reflows

      const { width, height } = getElementWidthAndHeight(this.element);
      this._container.setSizeToNodeSize(width, height, force);
    }
  }
}

/**
 * Represents component item component.
 * @public
 */
export type ComponentItemComponent = ComponentContainerComponent;

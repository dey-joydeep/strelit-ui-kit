import {
  createLayoutConfigFromResolved,
  resolveLayoutConfig,
  type LayoutConfig,
} from './config/config';
import {
  type MinifiedLayoutConfig,
  type ResolvedComponentItemConfig,
  unminifyResolvedLayoutConfig,
} from './config/resolved-config';
import {
  ComponentContainer,
  type ComponentContainerBindableComponent,
  type ComponentContainerComponent,
} from './container/component-container';
import { BindError } from './errors/external-error';
import {
  LayoutManager,
  LayoutManagerConstructorParameters,
} from './layout-manager';
import { DomConstants } from './utils/dom-constants';
import { I18nStringId, i18nStrings } from './utils/i18n-strings';

/**
 * Represents virtual layout bind component event handler.
 * @public
 */
export type VirtualLayoutBindComponentEventHandler = (
  this: void,
  container: ComponentContainer,
  itemConfig: ResolvedComponentItemConfig,
) => ComponentContainerBindableComponent;
/**
 * Represents virtual layout unbind component event handler.
 * @public
 */
export type VirtualLayoutUnbindComponentEventHandler = (
  this: void,
  container: ComponentContainer,
) => void;

/** @internal */
let virtualLayoutSubWindowChecked = false;
/** @internal */
export function createVirtualLayoutManagerConstructorParameters(
  containerElement: HTMLElement | undefined,
): LayoutManagerConstructorParameters {
  const windowConfigKey = virtualLayoutSubWindowChecked
    ? null
    : new URL(document.location.href).searchParams.get('strelit-window');
  virtualLayoutSubWindowChecked = true;
  const isSubWindow = windowConfigKey !== null;

  let config: LayoutConfig | undefined;
  if (windowConfigKey !== null) {
    const windowConfigStr = localStorage.getItem(windowConfigKey);
    if (windowConfigStr === null) {
      throw new Error('Missing Strelit popout configuration');
    }
    let minifiedWindowConfig: MinifiedLayoutConfig;
    try {
      minifiedWindowConfig = JSON.parse(
        windowConfigStr,
      ) as MinifiedLayoutConfig;
    } catch (err) {
      throw new Error(
        'Corrupt Strelit popout configuration in localStorage: ' + String(err),
      );
    }
    const resolvedConfig = unminifyResolvedLayoutConfig(minifiedWindowConfig);
    config = createLayoutConfigFromResolved(resolvedConfig);
  }

  return {
    subWindowLayoutConfig: config,
    isSubWindow,
    containerElement,
  };
}

/**
 * Provides virtual layout behavior.
 * @public
 */
export class VirtualLayout extends LayoutManager {
  /** The bind component event. */
  bindComponentEvent: VirtualLayoutBindComponentEventHandler | undefined;
  /** The unbind component event. */
  unbindComponentEvent: VirtualLayoutUnbindComponentEventHandler | undefined;

  /** @internal */
  private _bindComponentEventHandlerPassedInConstructor = false;
  /** @internal */
  private _creationTimeoutPassed = false; // remove when constructor is determinate
  /** @internal */
  private _popInButtonElement: HTMLElement | undefined;
  /** @internal */
  private _popInButtonClickListener: (() => void) | undefined;

  /**
   * @param container - A Dom HTML element. Defaults to body
   * @param bindComponentEventHandler - Event handler to bind components
   * @param bindComponentEventHandler - Event handler to unbind components
   * If bindComponentEventHandler is defined, then constructor will be determinate. It will always call the init()
   * function and the init() function will always complete. This means that the bindComponentEventHandler will be called
   * if constructor is for a popout window. Make sure bindComponentEventHandler is ready for events.
   */
  constructor(
    container?: HTMLElement,
    bindComponentEventHandler?: VirtualLayoutBindComponentEventHandler,
    unbindComponentEventHandler?: VirtualLayoutUnbindComponentEventHandler,
    skipInit = false,
  ) {
    super(createVirtualLayoutManagerConstructorParameters(container));

    if (bindComponentEventHandler !== undefined) {
      this.bindComponentEvent = bindComponentEventHandler;
      this._bindComponentEventHandlerPassedInConstructor = true;
      this.unbindComponentEvent = unbindComponentEventHandler;
    }

    if (!this._bindComponentEventHandlerPassedInConstructor) {
      if (this.isSubWindow) {
        // document.body.style.visibility = 'hidden';
        // Set up layoutConfig since constructor is not determinate and may exit early. Other functions may need
        // this.layoutConfig. this.layoutConfig is again calculated in the same way when init() completes.
        // Remove this when constructor is determinate.
        if (this._subWindowLayoutConfig === undefined) {
          throw new Error('Missing Strelit popout configuration');
        } else {
          const resolvedLayoutConfig = resolveLayoutConfig(
            this._subWindowLayoutConfig,
          );
          // remove root from layoutConfig
          this.layoutConfig = {
            ...resolvedLayoutConfig,
            root: undefined,
          };
        }
      }
    }

    if (!skipInit) {
      this.init();
    }
  }

  /** Performs the destroy operation. */
  override destroy(): void {
    if (this._popInButtonElement !== undefined) {
      if (this._popInButtonClickListener !== undefined) {
        this._popInButtonElement.removeEventListener(
          'click',
          this._popInButtonClickListener,
        );
        this._popInButtonClickListener = undefined;
      }
      this._popInButtonElement.remove();
      this._popInButtonElement = undefined;
    }
    super.destroy();

    this.bindComponentEvent = undefined;
    this.unbindComponentEvent = undefined;
  }

  /** Initializes the layout after binding handlers have been assigned. */
  override init(): void {
    if (this.isInitialised || this.isDestroyed) {
      return;
    }

    /**
     * If the document isn't ready yet, wait for it.
     */
    if (
      !this._bindComponentEventHandlerPassedInConstructor &&
      (document.readyState === 'loading' || document.body === null)
    ) {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          if (!this.isDestroyed) {
            this.init();
          }
        },
        { passive: true },
      );
      return;
    }

    /**
     * If this is a subwindow, wait a few milliseconds for the original
     * page's js calls to be executed, then replace the bodies content
     * with StrelitLayout
     */
    if (
      !this._bindComponentEventHandlerPassedInConstructor &&
      this.isSubWindow &&
      !this._creationTimeoutPassed
    ) {
      this._creationTimeoutPassed = true;
      if (document.readyState !== 'complete') {
        window.addEventListener(
          'load',
          () => {
            if (!this.isDestroyed) {
              this.init();
            }
          },
          { passive: true },
        );
      } else {
        setTimeout(() => {
          if (!this.isDestroyed) {
            this.init();
          }
        }, 0);
      }
      return;
    }

    if (this.isSubWindow) {
      if (!this._bindComponentEventHandlerPassedInConstructor) {
        this.clearHtmlAndAdjustStylesForSubWindow();
      }

      // Expose this instance on the window object to allow the opening window to interact with it
      window.__strelitInstance = this;
    }

    super.init();
  }

  /**
   * Clears existing HTML and adjusts style to make window suitable to be a popout sub window
   * Curently is automatically called when window is a subWindow and bindComponentEvent is not passed in the constructor
   * If bindComponentEvent is not passed in the constructor, the application must either call this function explicitly or
   * (preferably) make the window suitable as a subwindow.
   * In the future, it is planned that this function is NOT automatically called in any circumstances.  Applications will
   * need to determine whether a window is a Strelit Layout popout window and either call this function explicitly or
   * hide HTML not relevant to the popout.
   * See apitest for an example of how HTML is hidden when popout windows are displayed
   */
  clearHtmlAndAdjustStylesForSubWindow(): void {
    const headElement = document.head;

    const appendNodeLists = Array<NodeListOf<Element>>(4);
    appendNodeLists[0] = document.querySelectorAll('body link');
    appendNodeLists[1] = document.querySelectorAll('body style');
    appendNodeLists[2] = document.querySelectorAll('template');
    appendNodeLists[3] = document.querySelectorAll('.strelit_keep');

    for (let listIdx = 0; listIdx < appendNodeLists.length; listIdx++) {
      const appendNodeList = appendNodeLists[listIdx];
      for (let nodeIdx = 0; nodeIdx < appendNodeList.length; nodeIdx++) {
        const node = appendNodeList[nodeIdx];
        headElement.appendChild(node);
      }
    }

    const bodyElement = document.body;
    bodyElement.innerHTML = '';
    bodyElement.style.visibility = 'visible';
    this.checkAddDefaultPopinButton();

    /*
     * This seems a bit pointless, but actually causes a reflow/re-evaluation getting around
     * slickgrid's "Cannot find stylesheet." bug in chrome
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const x = document.body.offsetHeight;
  }
  /**
   * Will add button if not popinOnClose specified in settings
   * @returns true if added otherwise false
   */
  checkAddDefaultPopinButton(): boolean {
    if (this.layoutConfig.settings.popInOnClose) {
      return false;
    } else {
      const popInButtonElement = document.createElement('div');
      popInButtonElement.classList.add(DomConstants.ClassName.Popin);
      popInButtonElement.setAttribute('title', this.layoutConfig.header.dock);
      const iconElement = document.createElement('div');
      iconElement.classList.add(DomConstants.ClassName.Icon);
      const bgElement = document.createElement('div');
      bgElement.classList.add(DomConstants.ClassName.Bg);
      popInButtonElement.appendChild(iconElement);
      popInButtonElement.appendChild(bgElement);
      const clickListener = () => this.emit('popIn');
      popInButtonElement.addEventListener('click', clickListener);
      document.body.appendChild(popInButtonElement);
      this._popInButtonElement = popInButtonElement;
      this._popInButtonClickListener = clickListener;
      return true;
    }
  }

  /** @internal */
  override bindComponent(
    container: ComponentContainer,
    itemConfig: ResolvedComponentItemConfig,
  ): ComponentContainerBindableComponent {
    if (this.bindComponentEvent !== undefined) {
      const bindableComponent = this.bindComponentEvent(container, itemConfig);
      return bindableComponent;
    } else {
      const text =
        i18nStrings[
          I18nStringId
            .ComponentTypeNotRegisteredAndBindComponentEventHandlerNotAssigned
        ];
      const message = `${text}: ${JSON.stringify(itemConfig)}`;
      throw new BindError(message);
    }
  }

  /** @internal */
  override unbindComponent(
    container: ComponentContainer,
    virtual: boolean,
    component: ComponentContainerComponent | undefined,
  ): void {
    if (this.unbindComponentEvent !== undefined) {
      this.unbindComponentEvent(container);
    }
  }
}

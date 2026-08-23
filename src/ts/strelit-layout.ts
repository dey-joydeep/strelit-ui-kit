import {
  resolveComponentTypeName,
  type ResolvedComponentItemConfig,
} from './config/resolved-config';
import {
  ComponentContainer,
  type ComponentContainerBindableComponent,
  type ComponentContainerComponent,
} from './container/component-container';
import { BindError } from './errors/external-error';
import { AssertError, UnexpectedUndefinedError } from './errors/internal-error';
import { I18nStringId, i18nStrings } from './utils/i18n-strings';
import { LogicalZIndex, SerializableValue } from './utils/types';
import {
  deepCloneValue,
  ensureElementPositionAbsolute,
  numberToPixels,
  setElementDisplayVisibility,
  setElementHeight,
  setElementWidth,
} from './utils/utils';
import {
  VirtualLayout,
  type VirtualLayoutBindComponentEventHandler,
  type VirtualLayoutUnbindComponentEventHandler,
} from './virtual-layout';

/**
 * Defines the strelit layout virtual component contract.
 * @public
 */
export interface StrelitLayoutVirtualComponent {
  /** The root html element. */
  rootHtmlElement: HTMLElement;
}

/**
 * Represents strelit layout component constructor.
 * @public
 */
export type StrelitLayoutComponentConstructor<
  TState extends SerializableValue = SerializableValue,
  TComponent extends ComponentContainerComponent = ComponentContainerComponent,
> = new (
  container: ComponentContainer,
  state: TState | undefined,
  virtual: boolean,
) => TComponent;

/**
 * Represents strelit layout component factory function.
 * @public
 */
export type StrelitLayoutComponentFactoryFunction<
  TState extends SerializableValue = SerializableValue,
  TComponent extends ComponentContainerComponent = ComponentContainerComponent,
> = (
  container: ComponentContainer,
  state: TState | undefined,
  virtual: boolean,
) => TComponent | undefined | void;

/**
 * Validates persisted component state before a typed component callback runs.
 * @public
 */
export type StrelitLayoutComponentStateValidator<
  TState extends SerializableValue,
> = (state: SerializableValue | undefined) => state is TState | undefined;

/**
 * Defines the strelit layout component instantiator contract.
 * @public
 */
export interface StrelitLayoutComponentInstantiator<
  TState extends SerializableValue = SerializableValue,
  TComponent extends ComponentContainerComponent = ComponentContainerComponent,
> {
  /** The constructor. */
  readonly constructor:
    StrelitLayoutComponentConstructor<TState, TComponent> | undefined;
  /** The factory function. */
  readonly factoryFunction:
    StrelitLayoutComponentFactoryFunction<TState, TComponent> | undefined;
  /** The virtual. */
  readonly virtual: boolean;
}

type AnyStrelitLayoutComponentInstantiator = StrelitLayoutComponentInstantiator<
  SerializableValue,
  ComponentContainerComponent
>;

type StrelitLayoutComponentStateValidationFunction = (
  state: SerializableValue | undefined,
) => boolean;

interface RegisteredStrelitLayoutComponentInstantiator extends AnyStrelitLayoutComponentInstantiator {
  readonly stateValidator:
    StrelitLayoutComponentStateValidationFunction | undefined;
}

/**
 * Provides strelit layout behavior.
 * @public
 */
export class StrelitLayout extends VirtualLayout {
  /** @internal */
  private _componentTypesMap = new Map<
    string,
    RegisteredStrelitLayoutComponentInstantiator
  >();
  /** @internal */
  private _registeredComponentMap = new Map<
    ComponentContainer,
    ComponentContainerComponent | undefined
  >();
  /** @internal */
  private _virtualComponentMap = new Map<
    ComponentContainer,
    StrelitLayoutVirtualComponent
  >();
  /** @internal */
  private _strelitLayoutBoundingClientRect!: DOMRect;
  /** @internal */
  private _containerBoundingClientRectCache = new Map<
    ComponentContainer,
    DOMRect
  >();

  /** @internal */
  private _containerVirtualRectingRequiredEventListener = (
    container: ComponentContainer,
    width: number,
    height: number,
  ) =>
    this.handleContainerVirtualRectingRequiredEvent(container, width, height);
  /** @internal */
  private _containerVirtualVisibilityChangeRequiredEventListener = (
    container: ComponentContainer,
    visible: boolean,
  ) =>
    this.handleContainerVirtualVisibilityChangeRequiredEvent(
      container,
      visible,
    );
  /** @internal */
  private _containerVirtualZIndexChangeRequiredEventListener = (
    container: ComponentContainer,
    logicalZIndex: LogicalZIndex,
    defaultZIndex: string,
  ) =>
    this.handleContainerVirtualZIndexChangeRequiredEvent(
      container,
      logicalZIndex,
      defaultZIndex,
    );

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
  ) {
    super(
      container,
      bindComponentEventHandler,
      unbindComponentEventHandler,
      true,
    );
    // We told VirtualLayout to not call init() so this class can initialize its own properties first.
    this.init();
  }

  /** Registers a component constructor that accepts all serializable state. */
  registerComponentConstructor(
    typeName: string,
    componentConstructor: StrelitLayoutComponentConstructor,
    virtual?: boolean,
  ): void;
  /** Registers a typed component constructor with runtime state validation. */
  registerComponentConstructor<
    TState extends SerializableValue,
    TComponent extends ComponentContainerComponent =
      ComponentContainerComponent,
  >(
    typeName: string,
    componentConstructor: StrelitLayoutComponentConstructor<TState, TComponent>,
    stateValidator: StrelitLayoutComponentStateValidator<TState>,
    virtual?: boolean,
  ): void;
  /**
   * Registers a narrow component constructor without runtime state validation.
   * @deprecated Accept SerializableValue and validate it, or pass a state validator before the virtual flag.
   */
  registerComponentConstructor<
    TState extends SerializableValue,
    TComponent extends ComponentContainerComponent =
      ComponentContainerComponent,
  >(
    typeName: string,
    componentConstructor: StrelitLayoutComponentConstructor<TState, TComponent>,
    virtual?: boolean,
  ): void;
  registerComponentConstructor(
    typeName: string,
    componentConstructor: StrelitLayoutComponentConstructor<never>,
    stateValidatorOrVirtual:
      StrelitLayoutComponentStateValidationFunction | boolean = false,
    virtual = false,
  ): void {
    if (typeof componentConstructor !== 'function') {
      throw new Error(
        i18nStrings[I18nStringId.PleaseRegisterAConstructorFunction],
      );
    }

    const existingComponentType = this._componentTypesMap.get(typeName);

    if (existingComponentType !== undefined) {
      throw new BindError(
        `${i18nStrings[I18nStringId.ComponentIsAlreadyRegistered]}: ${typeName}`,
      );
    }

    const stateValidator =
      typeof stateValidatorOrVirtual === 'function'
        ? stateValidatorOrVirtual
        : undefined;
    const resolvedVirtual =
      typeof stateValidatorOrVirtual === 'boolean'
        ? stateValidatorOrVirtual
        : virtual;
    this._componentTypesMap.set(typeName, {
      constructor:
        componentConstructor as unknown as StrelitLayoutComponentConstructor,
      factoryFunction: undefined,
      virtual: resolvedVirtual,
      stateValidator,
    });
  }

  /** Registers a component factory that accepts all serializable state. */
  registerComponentFactoryFunction(
    typeName: string,
    componentFactoryFunction: StrelitLayoutComponentFactoryFunction,
    virtual?: boolean,
  ): void;
  /** Registers a typed component factory with runtime state validation. */
  registerComponentFactoryFunction<
    TState extends SerializableValue,
    TComponent extends ComponentContainerComponent =
      ComponentContainerComponent,
  >(
    typeName: string,
    componentFactoryFunction: StrelitLayoutComponentFactoryFunction<
      TState,
      TComponent
    >,
    stateValidator: StrelitLayoutComponentStateValidator<TState>,
    virtual?: boolean,
  ): void;
  /**
   * Registers a narrow component factory without runtime state validation.
   * @deprecated Accept SerializableValue and validate it, or pass a state validator before the virtual flag.
   */
  registerComponentFactoryFunction<
    TState extends SerializableValue,
    TComponent extends ComponentContainerComponent =
      ComponentContainerComponent,
  >(
    typeName: string,
    componentFactoryFunction: StrelitLayoutComponentFactoryFunction<
      TState,
      TComponent
    >,
    virtual?: boolean,
  ): void;
  registerComponentFactoryFunction(
    typeName: string,
    componentFactoryFunction: StrelitLayoutComponentFactoryFunction<never>,
    stateValidatorOrVirtual:
      StrelitLayoutComponentStateValidationFunction | boolean = false,
    virtual = false,
  ): void {
    if (typeof componentFactoryFunction !== 'function') {
      throw new BindError('Please register a constructor function');
    }

    const existingComponentType = this._componentTypesMap.get(typeName);

    if (existingComponentType !== undefined) {
      throw new BindError(
        `${i18nStrings[I18nStringId.ComponentIsAlreadyRegistered]}: ${typeName}`,
      );
    }

    const stateValidator =
      typeof stateValidatorOrVirtual === 'function'
        ? stateValidatorOrVirtual
        : undefined;
    const resolvedVirtual =
      typeof stateValidatorOrVirtual === 'boolean'
        ? stateValidatorOrVirtual
        : virtual;
    this._componentTypesMap.set(typeName, {
      constructor: undefined,
      factoryFunction:
        componentFactoryFunction as unknown as StrelitLayoutComponentFactoryFunction,
      virtual: resolvedVirtual,
      stateValidator,
    });
  }

  /** Returns registered component type names. */
  getRegisteredComponentTypeNames(): string[] {
    const typeNamesIterableIterator = this._componentTypesMap.keys();
    return Array.from(typeNamesIterableIterator);
  }

  /**
   * Returns a previously registered component instantiator.
   * Note that `undefined` will return if config.componentType is not a string
   *
   * @param config - The item config
   * @public
   */
  getComponentInstantiator(
    config: ResolvedComponentItemConfig,
  ): StrelitLayoutComponentInstantiator | undefined {
    const typeName = resolveComponentTypeName(config);
    if (typeName === undefined) {
      return undefined;
    }
    const instantiator = this._componentTypesMap.get(typeName);
    return instantiator === undefined
      ? undefined
      : Object.freeze({
          constructor: instantiator.constructor,
          factoryFunction: instantiator.factoryFunction,
          virtual: instantiator.virtual,
        });
  }

  /** @internal */
  override bindComponent(
    container: ComponentContainer,
    itemConfig: ResolvedComponentItemConfig,
  ): ComponentContainerBindableComponent {
    const typeName = resolveComponentTypeName(itemConfig);
    const instantiator =
      typeName === undefined
        ? undefined
        : this._componentTypesMap.get(typeName);

    let result: ComponentContainerBindableComponent;
    if (instantiator !== undefined) {
      const virtual = instantiator.virtual;
      let componentState: SerializableValue | undefined;
      if (itemConfig.componentState === undefined) {
        componentState = undefined;
      } else {
        // make copy
        componentState = deepCloneValue(
          itemConfig.componentState,
        ) as SerializableValue;
      }

      if (
        instantiator.stateValidator !== undefined &&
        !instantiator.stateValidator(componentState)
      ) {
        throw new BindError(
          `Component state rejected by validator: ${String(typeName)}`,
        );
      }

      let component: ComponentContainerComponent | undefined;
      const componentConstructor = instantiator.constructor;
      if (componentConstructor !== undefined) {
        component = new componentConstructor(
          container,
          componentState,
          virtual,
        );
      } else {
        const factoryFunction = instantiator.factoryFunction;
        if (factoryFunction !== undefined) {
          component = factoryFunction(container, componentState, virtual) as
            ComponentContainerComponent | undefined;
        } else {
          throw new AssertError('LMBCFFU10008');
        }
      }

      if (virtual) {
        if (component === undefined) {
          throw new UnexpectedUndefinedError('SLBCVCU988774');
        } else {
          const virtualComponent = component as StrelitLayoutVirtualComponent;
          const componentRootElement = virtualComponent.rootHtmlElement;
          if (componentRootElement === undefined) {
            throw new BindError(
              `${i18nStrings[I18nStringId.VirtualComponentDoesNotHaveRootHtmlElement]}: ${JSON.stringify(itemConfig.componentType)}`,
            );
          } else {
            ensureElementPositionAbsolute(componentRootElement);
            this.container.appendChild(componentRootElement);
            this._virtualComponentMap.set(container, virtualComponent);
            container.virtualRectingRequiredEvent =
              this._containerVirtualRectingRequiredEventListener;
            container.virtualVisibilityChangeRequiredEvent =
              this._containerVirtualVisibilityChangeRequiredEventListener;
            container.virtualZIndexChangeRequiredEvent =
              this._containerVirtualZIndexChangeRequiredEventListener;
          }
        }
      }

      this._registeredComponentMap.set(container, component);

      result = {
        virtual: instantiator.virtual,
        component,
      };
    } else {
      // Delegate application-managed component binding to VirtualLayout.
      result = super.bindComponent(container, itemConfig);
    }

    return result;
  }

  /** @internal */
  override unbindComponent(
    container: ComponentContainer,
    virtual: boolean,
    component: ComponentContainerComponent | undefined,
  ): void {
    if (!this._registeredComponentMap.has(container)) {
      super.unbindComponent(container, virtual, component); // was not created from registration so use virtual unbind events
    } else {
      const virtualComponent = this._virtualComponentMap.get(container);
      if (virtualComponent !== undefined) {
        const componentRootElement = virtualComponent.rootHtmlElement;
        if (componentRootElement === undefined) {
          throw new AssertError('SLUC77743', container.title);
        } else {
          componentRootElement.remove();
          container.virtualRectingRequiredEvent = undefined;
          container.virtualVisibilityChangeRequiredEvent = undefined;
          container.virtualZIndexChangeRequiredEvent = undefined;
          this._virtualComponentMap.delete(container);
        }
      }
      this._registeredComponentMap.delete(container);
    }
  }

  /** Performs the fire before virtual recting event operation. */
  override fireBeforeVirtualRectingEvent(
    count: number,
    containers?: readonly ComponentContainer[],
  ): void {
    this._containerBoundingClientRectCache.clear();
    this._strelitLayoutBoundingClientRect =
      this.container.getBoundingClientRect();
    if (containers !== undefined) {
      for (const container of containers) {
        this._containerBoundingClientRectCache.set(
          container,
          container.element.getBoundingClientRect(),
        );
      }
    }
    super.fireBeforeVirtualRectingEvent(count, containers);
  }

  /** Performs the fire after virtual recting event operation. */
  override fireAfterVirtualRectingEvent(): void {
    this._containerBoundingClientRectCache.clear();
    super.fireAfterVirtualRectingEvent();
  }

  /** @internal */
  private handleContainerVirtualRectingRequiredEvent(
    container: ComponentContainer,
    width: number,
    height: number,
  ): void {
    const virtualComponent = this._virtualComponentMap.get(container);
    if (virtualComponent === undefined) {
      throw new UnexpectedUndefinedError('SLHCSCE55933');
    } else {
      const rootElement = virtualComponent.rootHtmlElement;
      if (rootElement === undefined) {
        throw new BindError(
          i18nStrings[I18nStringId.ComponentIsNotVirtual] +
            ' ' +
            container.title,
        );
      } else {
        let containerBoundingClientRect =
          this._containerBoundingClientRectCache.get(container);
        if (containerBoundingClientRect === undefined) {
          containerBoundingClientRect =
            container.element.getBoundingClientRect();
          this._containerBoundingClientRectCache.set(
            container,
            containerBoundingClientRect,
          );
        }
        const left =
          containerBoundingClientRect.left -
          this._strelitLayoutBoundingClientRect.left;
        rootElement.style.left = numberToPixels(left);
        const top =
          containerBoundingClientRect.top -
          this._strelitLayoutBoundingClientRect.top;
        rootElement.style.top = numberToPixels(top);
        setElementWidth(rootElement, width);
        setElementHeight(rootElement, height);
      }
    }
  }

  /** @internal */
  private handleContainerVirtualVisibilityChangeRequiredEvent(
    container: ComponentContainer,
    visible: boolean,
  ): void {
    const virtualComponent = this._virtualComponentMap.get(container);
    if (virtualComponent === undefined) {
      throw new UnexpectedUndefinedError('SLHCVVCRE55934');
    } else {
      const rootElement = virtualComponent.rootHtmlElement;
      if (rootElement === undefined) {
        throw new BindError(
          i18nStrings[I18nStringId.ComponentIsNotVirtual] +
            ' ' +
            container.title,
        );
      } else {
        setElementDisplayVisibility(rootElement, visible);
      }
    }
  }

  /** @internal */
  private handleContainerVirtualZIndexChangeRequiredEvent(
    container: ComponentContainer,
    logicalZIndex: LogicalZIndex,
    defaultZIndex: string,
  ) {
    const virtualComponent = this._virtualComponentMap.get(container);
    if (virtualComponent === undefined) {
      throw new UnexpectedUndefinedError('SLHCVZICRE55935');
    } else {
      const rootElement = virtualComponent.rootHtmlElement;
      if (rootElement === undefined) {
        throw new BindError(
          i18nStrings[I18nStringId.ComponentIsNotVirtual] +
            ' ' +
            container.title,
        );
      } else {
        rootElement.style.zIndex = defaultZIndex;
      }
    }
  }
}

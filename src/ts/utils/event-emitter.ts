import { BrowserPopout } from '../controls/browser-popout';
import { Tab } from '../controls/tab';
import { ComponentItem } from '../items/component-item';

/**
 * The name of the event that's triggered for every event
 * @public
 */
export const eventEmitterAllEventName = '__all';

const eventDispatchGuardSymbol = Symbol.for(
  'strelit-ui-kit.event-dispatch-guard',
);
/**
 * Provides the event emitter header click event name.
 * @public
 */
export const eventEmitterHeaderClickEventName = 'stackHeaderClick';
/**
 * Provides the event emitter header touch start event name.
 * @public
 */
export const eventEmitterHeaderTouchStartEventName = 'stackHeaderTouchStart';

/**
 * Represents event emitter unknown params.
 * @public
 */
export type EventEmitterUnknownParams = unknown[];
/**
 * Represents event emitter no params.
 * @public
 */
export type EventEmitterNoParams = [];
/**
 * Represents event emitter unknown param.
 * @public
 */
export type EventEmitterUnknownParam = [unknown];
/**
 * Represents event emitter popout param.
 * @public
 */
export type EventEmitterPopoutParam = [BrowserPopout];
/**
 * Represents event emitter component item param.
 * @public
 */
export type EventEmitterComponentItemParam = [ComponentItem];
/**
 * Represents event emitter tab param.
 * @public
 */
export type EventEmitterTabParam = [Tab];
/**
 * Represents event emitter string param.
 * @public
 */
export type EventEmitterStringParam = [string];
/**
 * Represents event emitter drag start params.
 * @public
 */
export type EventEmitterDragStartParams = [
  originalX: number,
  originalY: number,
];
/**
 * Represents event emitter drag stop params.
 * @public
 */
export type EventEmitterDragStopParams = [event: PointerEvent | undefined];
/**
 * Represents event emitter drag params.
 * @public
 */
export type EventEmitterDragParams = [
  offsetX: number,
  offsetY: number,
  event: PointerEvent,
];
/**
 * Represents event emitter before component release params.
 * @public
 */
export type EventEmitterBeforeComponentReleaseParams = [component: unknown];

/**
 * Provides event emitter bubbling event behavior.
 * @public
 */
export class EventEmitterBubblingEvent {
  /** @internal */
  private _isPropagationStopped = false;

  /** Gets the name. */
  get name(): string {
    return this._name;
  }
  /** Gets the target. */
  get target(): EventEmitter {
    return this._target;
  }
  /** Gets the is propagation stopped. */
  get isPropagationStopped(): boolean {
    return this._isPropagationStopped;
  }

  /** Prevents unsupported direct construction. @public */
  constructor(_nonConstructible: never, ..._args: never[]);
  /** @internal */
  constructor(name: string, target: EventEmitter);
  /** @internal */
  constructor(
    /** @internal */
    private readonly _name: string,
    /** @internal */
    private readonly _target: EventEmitter,
  ) {}

  /** Performs the stop propagation operation. */
  stopPropagation(): void {
    this._isPropagationStopped = true;
  }
}

/**
 * Provides click bubbling event behavior.
 * @public
 */
export class ClickBubblingEvent extends EventEmitterBubblingEvent {
  /** Gets the mouse event. */
  get mouseEvent(): MouseEvent {
    return this._mouseEvent;
  }

  /** Prevents unsupported direct construction. @public */
  constructor(_nonConstructible: never, ..._args: never[]);
  /** @internal */
  constructor(name: string, target: EventEmitter, mouseEvent: MouseEvent);
  /** @internal */
  constructor(
    name: string,
    target: EventEmitter,
    /** @internal */
    private readonly _mouseEvent: MouseEvent,
  ) {
    super(name, target);
  }
}

/**
 * Provides touch start bubbling event behavior.
 * @public
 */
export class TouchStartBubblingEvent extends EventEmitterBubblingEvent {
  /** Gets the touch event. */
  get touchEvent(): TouchEvent {
    return this._touchEvent;
  }

  /** Prevents unsupported direct construction. @public */
  constructor(_nonConstructible: never, ..._args: never[]);
  /** @internal */
  constructor(name: string, target: EventEmitter, touchEvent: TouchEvent);
  /** @internal */
  constructor(
    name: string,
    target: EventEmitter,
    /** @internal */
    private readonly _touchEvent: TouchEvent,
  ) {
    super(name, target);
  }
}

/**
 * Represents event emitter bubbling event param.
 * @public
 */
export type EventEmitterBubblingEventParam = [EventEmitterBubblingEvent];
/**
 * Represents event emitter click bubbling event param.
 * @public
 */
export type EventEmitterClickBubblingEventParam = [ClickBubblingEvent];
/**
 * Represents event emitter touch start bubbling event param.
 * @public
 */
export type EventEmitterTouchStartBubblingEventParam = [
  TouchStartBubblingEvent,
];

/** @internal */
export type EventEmitterUnknownCallback = (
  this: void,
  ...args: EventEmitterUnknownParams
) => void;
/**
 * Represents event emitter callback.
 * @public
 */
export type EventEmitterCallback<K extends keyof EventEmitterEventParamsMap> = (
  this: void,
  ...args: EventEmitterEventParamsMap[K]
) => void;

/**
 * Defines the event emitter event params map contract.
 * @public
 */
export interface EventEmitterEventParamsMap {
  /** Defines the parameters emitted for the __all event. */
  __all: EventEmitterUnknownParams;
  /** Defines the parameters emitted for the activeContentItemChanged event. */
  activeContentItemChanged: EventEmitterComponentItemParam;
  /** Defines the parameters emitted for the close event. */
  close: EventEmitterNoParams;
  /** Defines the parameters emitted for the closed event. */
  closed: EventEmitterNoParams;
  /** Defines the parameters emitted for the destroy event. */
  destroy: EventEmitterNoParams;
  /** Defines the parameters emitted for the drag event. */
  drag: EventEmitterDragParams;
  /** Defines the parameters emitted for the dragStart event. */
  dragStart: EventEmitterDragStartParams;
  /** Defines the parameters emitted for the dragStop event. */
  dragStop: EventEmitterDragStopParams;
  /** Defines the parameters emitted for the hide event. */
  hide: EventEmitterNoParams;
  /** Defines the parameters emitted for the initialised event. */
  initialised: EventEmitterNoParams;
  /** Defines the parameters emitted for the itemDropped event. */
  itemDropped: EventEmitterComponentItemParam;
  /** Defines the parameters emitted for the maximised event. */
  maximised: EventEmitterNoParams;
  /** Defines the parameters emitted for the minimised event. */
  minimised: EventEmitterNoParams;
  /** Defines the parameters emitted for the open event. */
  open: EventEmitterNoParams;
  /** Defines the parameters emitted for the popIn event. */
  popIn: EventEmitterNoParams;
  /** Defines the parameters emitted for the resize event. */
  resize: EventEmitterNoParams;
  /** Defines the parameters emitted for the show event. */
  show: EventEmitterNoParams;
  /** Defines the parameters emitted for the stateChanged event. */
  stateChanged: EventEmitterNoParams;
  /** Defines the parameters emitted for the tab event. */
  tab: EventEmitterTabParam;
  /** Defines the parameters emitted for the tabCreated event. */
  tabCreated: EventEmitterTabParam;
  /** Defines the parameters emitted for the titleChanged event. */
  titleChanged: EventEmitterStringParam;
  /** Defines the parameters emitted for the windowClosed event. */
  windowClosed: EventEmitterPopoutParam;
  /** Defines the parameters emitted for the windowOpened event. */
  windowOpened: EventEmitterPopoutParam;
  /** Defines the parameters emitted for the beforeComponentRelease event. */
  beforeComponentRelease: EventEmitterBeforeComponentReleaseParams;
  /** Defines the parameters emitted for the beforeItemDestroyed event. */
  beforeItemDestroyed: EventEmitterBubblingEventParam;
  /** Defines the parameters emitted for the itemCreated event. */
  itemCreated: EventEmitterBubblingEventParam;
  /** Defines the parameters emitted when a stack is created. */
  stackCreated: EventEmitterBubblingEventParam;
  /** Defines the parameters emitted when a row is created. */
  rowCreated: EventEmitterBubblingEventParam;
  /** Defines the parameters emitted when a column is created. */
  columnCreated: EventEmitterBubblingEventParam;
  /** Defines the parameters emitted when a component is created. */
  componentCreated: EventEmitterBubblingEventParam;
  /** Defines the parameters emitted for the itemDestroyed event. */
  itemDestroyed: EventEmitterBubblingEventParam;
  /** Defines the parameters emitted for the focus event. */
  focus: EventEmitterBubblingEventParam;
  /** Defines the parameters emitted for the blur event. */
  blur: EventEmitterBubblingEventParam;
  /** Defines the parameters emitted for the stackHeaderClick event. */
  stackHeaderClick: EventEmitterClickBubblingEventParam;
  /** Defines the parameters emitted for the stackHeaderTouchStart event. */
  stackHeaderTouchStart: EventEmitterTouchStartBubblingEventParam;
  /** Defines the parameters emitted for the userBroadcast event. */
  userBroadcast: EventEmitterUnknownParams;
}

/**
 * A generic and very fast EventEmitter implementation. On top of emitting the actual event it emits an
 * {@link eventEmitterAllEventName} event for every event triggered. This allows to hook into it and proxy events forwards
 * @public
 */
export class EventEmitter {
  /** @internal */
  private _allEventSubscriptions: EventEmitterUnknownCallback[] = [];
  /** @internal */
  private _subscriptionsMap = new Map<string, EventEmitterUnknownCallback[]>();

  /** @internal */
  private isEventDispatchAllowed(eventName: string): boolean {
    const guard = (
      this as unknown as Record<
        symbol,
        ((guardedEventName: string) => boolean) | undefined
      >
    )[eventDispatchGuardSymbol];
    return guard?.(eventName) ?? true;
  }

  /** Performs the try bubble event operation. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tryBubbleEvent(name: string, args: unknown[]): void {
    // overridden by ContentItem
  }

  /**
   * Emit an event and notify listeners
   *
   * @param eventName - The name of the event
   * @param args - Additional arguments that will be passed to the listener
   */
  emit<K extends keyof EventEmitterEventParamsMap>(
    eventName: K,
    ...args: EventEmitterEventParamsMap[K]
  ): void {
    let firstError: unknown;
    let hasError = false;
    let subscriptions = this._subscriptionsMap.get(eventName);

    if (subscriptions !== undefined) {
      subscriptions = subscriptions.slice();
      for (let i = 0; i < subscriptions.length; i++) {
        if (!this.isEventDispatchAllowed(eventName)) {
          break;
        }
        try {
          subscriptions[i](...args);
        } catch (error) {
          if (!hasError) firstError = error;
          hasError = true;
        }
      }
    }

    if (this.isEventDispatchAllowed(eventName)) {
      try {
        this.emitAllEvent(eventName, args);
      } catch (error) {
        if (!hasError) firstError = error;
        hasError = true;
      }
    }
    if (this.isEventDispatchAllowed(eventName)) {
      try {
        this.tryBubbleEvent(eventName, args);
      } catch (error) {
        if (!hasError) firstError = error;
        hasError = true;
      }
    }
    if (hasError) {
      throw firstError;
    }
  }

  /** @internal */
  emitUnknown(eventName: string, ...args: EventEmitterUnknownParams): void {
    let firstError: unknown;
    let hasError = false;
    let subs = this._subscriptionsMap.get(eventName);

    if (subs !== undefined) {
      subs = subs.slice();
      for (let i = 0; i < subs.length; i++) {
        if (!this.isEventDispatchAllowed(eventName)) {
          break;
        }
        try {
          subs[i](...args);
        } catch (error) {
          if (!hasError) firstError = error;
          hasError = true;
        }
      }
    }

    if (this.isEventDispatchAllowed(eventName)) {
      try {
        this.emitAllEvent(eventName, args);
      } catch (error) {
        if (!hasError) firstError = error;
        hasError = true;
      }
    }
    if (this.isEventDispatchAllowed(eventName)) {
      try {
        this.tryBubbleEvent(eventName, args);
      } catch (error) {
        if (!hasError) firstError = error;
        hasError = true;
      }
    }
    if (hasError) {
      throw firstError;
    }
  }

  /* @internal **/
  /** Emits base bubbling event. */
  emitBaseBubblingEvent<K extends keyof EventEmitterEventParamsMap>(
    eventName: K,
  ): void {
    const event = new EventEmitterBubblingEvent(eventName, this);
    this.emitUnknown(eventName, event);
  }

  /** @internal */
  emitUnknownBubblingEvent(eventName: string): void {
    const event = new EventEmitterBubblingEvent(eventName, this);
    this.emitUnknown(eventName, event);
  }

  /**
   * Removes a listener for an event.
   * @param eventName - The name of the event
   * @param callback - The previously registered callback method (optional)
   */
  removeEventListener<K extends keyof EventEmitterEventParamsMap>(
    eventName: K,
    callback: EventEmitterCallback<K>,
  ): void {
    const unknownCallback = callback as EventEmitterUnknownCallback;
    this.removeUnknownEventListener(eventName, unknownCallback);
  }

  /** Performs the off operation. */
  off<K extends keyof EventEmitterEventParamsMap>(
    eventName: K,
    callback: EventEmitterCallback<K>,
  ): void {
    this.removeEventListener(eventName, callback);
  }

  /**
   * Alias for off
   */
  unbind = <K extends keyof EventEmitterEventParamsMap>(
    eventName: K,
    callback: EventEmitterCallback<K>,
  ): void => this.removeEventListener(eventName, callback);

  /**
   * Alias for emit
   */
  trigger = <K extends keyof EventEmitterEventParamsMap>(
    eventName: K,
    ...args: EventEmitterEventParamsMap[K]
  ): void => this.emit(eventName, ...args);

  /**
   * Listen for events
   *
   * @param eventName - The name of the event to listen to
   * @param callback - The callback to execute when the event occurs
   */
  addEventListener<K extends keyof EventEmitterEventParamsMap>(
    eventName: K,
    callback: EventEmitterCallback<K>,
  ): void {
    const unknownCallback = callback as EventEmitterUnknownCallback;
    this.addUnknownEventListener(eventName, unknownCallback);
  }

  /** Performs the on operation. */
  on<K extends keyof EventEmitterEventParamsMap>(
    eventName: K,
    callback: EventEmitterCallback<K>,
  ): void {
    this.addEventListener(eventName, callback);
  }

  /** @internal */
  private addUnknownEventListener(
    eventName: string,
    callback: EventEmitterUnknownCallback,
  ): void {
    if (eventName === eventEmitterAllEventName) {
      this._allEventSubscriptions.push(callback);
    } else {
      let subscriptions = this._subscriptionsMap.get(eventName);
      if (subscriptions !== undefined) {
        subscriptions.push(callback);
      } else {
        subscriptions = [callback];
        this._subscriptionsMap.set(eventName, subscriptions);
      }
    }
  }

  /** @internal */
  private removeUnknownEventListener(
    eventName: string,
    callback: EventEmitterUnknownCallback,
  ): void {
    if (eventName === eventEmitterAllEventName) {
      this.removeSubscription(eventName, this._allEventSubscriptions, callback);
    } else {
      const subscriptions = this._subscriptionsMap.get(eventName);
      if (subscriptions === undefined) {
        throw new Error(
          'No subscribtions to unsubscribe for event ' + eventName,
        );
      } else {
        this.removeSubscription(eventName, subscriptions, callback);
      }
    }
  }

  /** @internal */
  private removeSubscription(
    eventName: string,
    subscriptions: EventEmitterUnknownCallback[],
    callback: EventEmitterUnknownCallback,
  ) {
    const idx = subscriptions.indexOf(callback);
    if (idx < 0) {
      throw new Error('Nothing to unbind for ' + eventName);
    } else {
      subscriptions.splice(idx, 1);
    }
  }

  /** @internal */
  private emitAllEvent(eventName: string, args: unknown[]) {
    const allEventSubscriptionsCount = this._allEventSubscriptions.length;
    let firstError: unknown;
    let hasError = false;
    if (allEventSubscriptionsCount > 0) {
      const unknownArgs = args.slice() as EventEmitterUnknownParams;
      unknownArgs.unshift(eventName);

      const allEventSubcriptions = this._allEventSubscriptions.slice();

      for (let i = 0; i < allEventSubscriptionsCount; i++) {
        if (!this.isEventDispatchAllowed(eventName)) {
          break;
        }
        try {
          allEventSubcriptions[i](...unknownArgs);
        } catch (error) {
          if (!hasError) firstError = error;
          hasError = true;
        }
      }
      if (hasError) {
        throw firstError;
      }
    }
  }
}

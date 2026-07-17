import { BrowserPopout } from '../controls/browser-popout';
import { Tab } from '../controls/tab';
import { ComponentItem } from '../items/component-item';

/**
 * The name of the event that's triggered for every event
 * @public
 */
export const eventEmitterAllEventName = '__all';
/** @public */
export const eventEmitterHeaderClickEventName = 'stackHeaderClick';
/** @public */
export const eventEmitterHeaderTouchStartEventName = 'stackHeaderTouchStart';

/** @public */
export type EventEmitterUnknownParams = unknown[];
/** @public */
export type EventEmitterNoParams = [];
/** @public */
export type EventEmitterUnknownParam = [unknown];
/** @public */
export type EventEmitterPopoutParam = [BrowserPopout];
/** @public */
export type EventEmitterComponentItemParam = [ComponentItem];
/** @public */
export type EventEmitterTabParam = [Tab];
/** @public */
export type EventEmitterStringParam = [string];
/** @public */
export type EventEmitterDragStartParams = [
  originalX: number,
  originalY: number,
];
/** @public */
export type EventEmitterDragStopParams = [event: PointerEvent | undefined];
/** @public */
export type EventEmitterDragParams = [
  offsetX: number,
  offsetY: number,
  event: PointerEvent,
];
/** @public */
export type EventEmitterBeforeComponentReleaseParams = [component: unknown];

/** @public */
export class EventEmitterBubblingEvent {
  /** @internal */
  private _isPropagationStopped = false;

  get name(): string {
    return this._name;
  }
  get target(): EventEmitter {
    return this._target;
  }
  get isPropagationStopped(): boolean {
    return this._isPropagationStopped;
  }

  /** @internal */
  constructor(
    /** @internal */
    private readonly _name: string,
    /** @internal */
    private readonly _target: EventEmitter,
  ) {}

  stopPropagation(): void {
    this._isPropagationStopped = true;
  }
}

/** @public */
export class ClickBubblingEvent extends EventEmitterBubblingEvent {
  get mouseEvent(): MouseEvent {
    return this._mouseEvent;
  }

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

/** @public */
export class TouchStartBubblingEvent extends EventEmitterBubblingEvent {
  get touchEvent(): TouchEvent {
    return this._touchEvent;
  }

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

/** @public */
export type EventEmitterBubblingEventParam = [EventEmitterBubblingEvent];
/** @public */
export type EventEmitterClickBubblingEventParam = [ClickBubblingEvent];
/** @public */
export type EventEmitterTouchStartBubblingEventParam = [
  TouchStartBubblingEvent,
];

/** @internal */
export type EventEmitterUnknownCallback = (
  this: void,
  ...args: EventEmitterUnknownParams
) => void;
/** @public */
export type EventEmitterCallback<K extends keyof EventEmitterEventParamsMap> = (
  this: void,
  ...args: EventEmitterEventParamsMap[K]
) => void;

/** @public */
export interface EventEmitterEventParamsMap {
  __all: EventEmitterUnknownParams;
  activeContentItemChanged: EventEmitterComponentItemParam;
  close: EventEmitterNoParams;
  closed: EventEmitterNoParams;
  destroy: EventEmitterNoParams;
  drag: EventEmitterDragParams;
  dragStart: EventEmitterDragStartParams;
  dragStop: EventEmitterDragStopParams;
  hide: EventEmitterNoParams;
  initialised: EventEmitterNoParams;
  itemDropped: EventEmitterComponentItemParam;
  maximised: EventEmitterNoParams;
  minimised: EventEmitterNoParams;
  open: EventEmitterNoParams;
  popIn: EventEmitterNoParams;
  resize: EventEmitterNoParams;
  show: EventEmitterNoParams;
  stateChanged: EventEmitterNoParams;
  tab: EventEmitterTabParam;
  tabCreated: EventEmitterTabParam;
  titleChanged: EventEmitterStringParam;
  windowClosed: EventEmitterPopoutParam;
  windowOpened: EventEmitterPopoutParam;
  beforeComponentRelease: EventEmitterBeforeComponentReleaseParams;
  beforeItemDestroyed: EventEmitterBubblingEventParam;
  itemCreated: EventEmitterBubblingEventParam;
  itemDestroyed: EventEmitterBubblingEventParam;
  focus: EventEmitterBubblingEventParam;
  blur: EventEmitterBubblingEventParam;
  stackHeaderClick: EventEmitterClickBubblingEventParam;
  stackHeaderTouchStart: EventEmitterTouchStartBubblingEventParam;
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
    let subcriptions = this._subscriptionsMap.get(eventName);

    if (subcriptions !== undefined) {
      subcriptions = subcriptions.slice();
      for (let i = 0; i < subcriptions.length; i++) {
        const subscription = subcriptions[i];
        subscription(...args);
      }
    }

    this.emitAllEvent(eventName, args);
    this.tryBubbleEvent(eventName, args);
  }

  /** @internal */
  emitUnknown(eventName: string, ...args: EventEmitterUnknownParams): void {
    let subs = this._subscriptionsMap.get(eventName);

    if (subs !== undefined) {
      subs = subs.slice();
      for (let i = 0; i < subs.length; i++) {
        subs[i](...args);
      }
    }

    this.emitAllEvent(eventName, args);
    this.tryBubbleEvent(eventName, args);
  }

  /* @internal **/
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
    if (allEventSubscriptionsCount > 0) {
      const unknownArgs = args.slice() as EventEmitterUnknownParams;
      unknownArgs.unshift(eventName);

      const allEventSubcriptions = this._allEventSubscriptions.slice();

      for (let i = 0; i < allEventSubscriptionsCount; i++) {
        allEventSubcriptions[i](...unknownArgs);
      }
    }
  }
}

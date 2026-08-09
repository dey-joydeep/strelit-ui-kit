import {
  UnexpectedNullError,
  UnexpectedUndefinedError,
} from '../errors/internal-error';
import { LayoutManager } from '../layout-manager';
import {
  EventEmitter,
  type EventEmitterEventParamsMap,
  type EventEmitterUnknownParams,
} from './event-emitter';

/** @internal */
export const eventHubChildEventName = 'strelit_child_event';
/** @internal */
export type EventHubChildEventDetail = {
  layoutManager: LayoutManager;
  eventName: string;
  args: unknown[];
};
type EventHubPropagationEventDetail = EventHubChildEventDetail & {
  originLayoutManager?: LayoutManager;
};
/** @internal */
export type EventHubChildEventInit = CustomEventInit<EventHubChildEventDetail>;

// Add our ChildEvent to WindowEventMap for type safety
/** Adds Strelit's cross-window event to the browser event map. @public */
declare global {
  interface WindowEventMap {
    [eventHubChildEventName]: CustomEvent<EventHubChildEventDetail>;
  }
}

/**
 * An EventEmitter singleton that propagates events
 * across multiple windows. This is a little bit trickier since
 * windows are allowed to open childWindows in their own right.
 *
 * This means that we deal with a tree of windows. Therefore, we do the event propagation in two phases:
 *
 * - Propagate events from this layout to the parent layout
 *   - Repeat until the event arrived at the root layout
 * - Propagate events to every layout except the originating layout
 *   - Repeat until every other layout got the event
 *
 * **WARNING**: Only userBroadcast events are propagated between windows.
 * This means the you have to take care of propagating state changes between windows yourself.
 *
 * @public
 */
export class EventHub extends EventEmitter {
  /** @internal */
  private _childEventListener = (
    childEvent: CustomEvent<EventHubChildEventDetail>,
  ) => this.onEventFromChild(childEvent);

  /**
   * Creates a new EventHub instance
   * @param _layoutManager - the layout manager to synchronize between the windows
   * @internal
   */
  constructor(
    /** @internal */
    private _layoutManager: LayoutManager,
  ) {
    super();
    globalThis.addEventListener(
      eventHubChildEventName,
      this._childEventListener,
      { passive: true },
    );
  }

  /**
   * Emit an event and notify listeners
   *
   * @param eventName - The name of the event
   * @param args - Additional arguments that will be passed to the listener
   * @public
   */
  override emit<K extends keyof EventEmitterEventParamsMap>(
    eventName: K,
    ...args: EventEmitterEventParamsMap[K]
  ): void {
    if (eventName === 'userBroadcast') {
      // Explicitly redirect the user broadcast to our overridden method.
      this.emitUserBroadcast(...args);
    } else {
      super.emit(eventName, ...args);
    }
  }

  /**
   * Broadcasts a message to all other currently opened windows. The sender
   * does not receive its own broadcast.
   * @public
   */
  emitUserBroadcast(...args: EventEmitterUnknownParams): void {
    // Step 1: Bubble up the event
    this.handleUserBroadcastEvent('userBroadcast', args, this._layoutManager);
  }

  /**
   * Destroys the EventHub
   * @internal
   */
  destroy(): void {
    globalThis.removeEventListener(
      eventHubChildEventName,
      this._childEventListener,
    );
  }

  /**
   * Internal processor to process local events.
   * @internal
   */
  private handleUserBroadcastEvent(
    eventName: string,
    args: unknown[],
    originLayoutManager: LayoutManager,
  ) {
    if (this._layoutManager.isSubWindow) {
      // We are a sub window and received an event from one of our children.
      // So propagate it to the Root.
      this.propagateToParent(eventName, args, originLayoutManager);
    } else {
      // We are the root window, propagate it to the subtree below us.
      this.propagateToThisAndSubtree(eventName, args, originLayoutManager);
    }
  }

  /**
   * Callback for child events raised on the window
   * @internal
   */
  private onEventFromChild(event: CustomEvent<EventHubChildEventDetail>) {
    const detail = event.detail as EventHubPropagationEventDetail;
    const isOwnedChild = this._layoutManager.openPopouts.some((popout) => {
      try {
        return popout.getStrelitInstance() === detail.layoutManager;
      } catch {
        return false;
      }
    });
    if (!isOwnedChild) {
      return;
    }

    this.handleUserBroadcastEvent(
      detail.eventName,
      detail.args,
      detail.originLayoutManager ?? detail.layoutManager,
    );
  }

  /**
   * Propagates the event to the parent by emitting
   * it on the parent's DOM window
   * @internal
   */
  private propagateToParent(
    eventName: string,
    args: unknown[],
    originLayoutManager: LayoutManager,
  ) {
    const detail: EventHubPropagationEventDetail = {
      layoutManager: this._layoutManager,
      originLayoutManager,
      eventName,
      args: args,
    };

    const eventInit: EventHubChildEventInit = {
      bubbles: true,
      cancelable: true,
      detail,
    };

    const event = new CustomEvent<EventHubChildEventDetail>(
      eventHubChildEventName,
      eventInit,
    );
    const opener = globalThis.opener as (GlobalEventHandlers & Window) | null;
    if (opener === null || opener.closed) {
      return;
    }

    opener.dispatchEvent(event);
  }

  /**
   * Propagate events to the whole subtree under this event hub.
   * @internal
   */
  private propagateToThisAndSubtree(
    eventName: string,
    args: unknown[],
    originLayoutManager: LayoutManager,
  ) {
    if (this._layoutManager !== originLayoutManager) {
      this.emitUnknown(eventName, ...args);
    }
    for (let i = 0; i < this._layoutManager.openPopouts.length; i++) {
      let childLayout: LayoutManager | undefined;
      try {
        childLayout = this._layoutManager.openPopouts[i].getStrelitInstance();
      } catch (error) {
        if (
          !(error instanceof UnexpectedNullError) &&
          !(error instanceof UnexpectedUndefinedError) &&
          !isCrossOriginAccessError(error)
        ) {
          throw error;
        }
        // A newly opened child does not expose its layout until initialization.
      }
      if (childLayout !== undefined) {
        childLayout.eventHub.propagateToThisAndSubtree(
          eventName,
          args,
          originLayoutManager,
        );
      }
    }
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

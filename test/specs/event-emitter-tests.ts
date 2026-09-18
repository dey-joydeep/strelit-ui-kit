import { describe, expect, it, vi } from 'vitest';
import { EventEmitter, eventEmitterAllEventName } from '../../src';

describe('the EventEmitter', function () {
  class EmitterImplementor extends EventEmitter {}

  it('can be extended', function () {
    const myObject = new EmitterImplementor();
    expect(typeof myObject.on).toBe('function');
    expect(typeof myObject.unbind).toBe('function');
    expect(typeof myObject.trigger).toBe('function');
  });

  it('notifies callbacks', function () {
    const myObject = new EmitterImplementor();
    const myListener: { newTitleCallback: (newTitle: string) => void } = {
      newTitleCallback: () => void 0,
    };
    const callbackSpy = vi.spyOn(myListener, 'newTitleCallback');
    expect(myListener.newTitleCallback).not.toHaveBeenCalled();
    myObject.on('titleChanged', myListener.newTitleCallback);
    expect(myListener.newTitleCallback).not.toHaveBeenCalled();
    myObject.emit('titleChanged', 'Good Morning');
    expect(myListener.newTitleCallback).toHaveBeenCalledWith('Good Morning');
    expect(callbackSpy).toHaveBeenCalledTimes(1);
  });

  it("triggers an 'all' event", function () {
    const myObject = new EmitterImplementor();
    const myListener: {
      newTitleCallback: (newTitle: string) => void;
      allCallback: (...args: unknown[]) => void;
    } = {
      newTitleCallback: () => void 0,
      allCallback: () => void 0,
    };
    const titleCallbackSpy = vi.spyOn(myListener, 'newTitleCallback');
    const allCallbackSpy = vi.spyOn(myListener, 'allCallback');

    myObject.on('titleChanged', myListener.newTitleCallback);
    myObject.on(eventEmitterAllEventName, myListener.allCallback);

    expect(myListener.newTitleCallback).not.toHaveBeenCalled();
    expect(myListener.allCallback).not.toHaveBeenCalled();
    myObject.emit('titleChanged', 'Good Morning');
    expect(myListener.newTitleCallback).toHaveBeenCalledWith('Good Morning');
    expect(titleCallbackSpy).toHaveBeenCalledTimes(1);
    expect(myListener.allCallback).toHaveBeenCalledWith(
      'titleChanged',
      'Good Morning',
    );
    expect(allCallbackSpy).toHaveBeenCalledTimes(1);

    myObject.emit('dragStart', 123, 456);
    expect(titleCallbackSpy).toHaveBeenCalledTimes(1);
    expect(myListener.allCallback).toHaveBeenCalledWith('dragStart', 123, 456);
    expect(allCallbackSpy).toHaveBeenCalledTimes(2);
  });

  it('stops all-subscriber dispatch and bubbling when a lifecycle guard closes', function () {
    class GuardedEmitter extends EventEmitter {
      allowed = true;
      readonly bubbled = vi.fn();

      constructor() {
        super();
        Object.defineProperty(
          this,
          Symbol.for('strelit-ui-kit.event-dispatch-guard'),
          { value: () => this.allowed },
        );
      }

      override tryBubbleEvent(): void {
        this.bubbled();
      }
    }
    const emitter = new GuardedEmitter();
    const laterAllSubscriber = vi.fn();
    emitter.on(eventEmitterAllEventName, () => {
      emitter.allowed = false;
    });
    emitter.on(eventEmitterAllEventName, laterAllSubscriber);

    emitter.emit('titleChanged', 'new title');

    expect(laterAllSubscriber).not.toHaveBeenCalled();
    expect(emitter.bubbled).not.toHaveBeenCalled();
  });

  it.each(['emit', 'emitUnknown'] as const)(
    '%s preserves throw undefined and continues later listeners',
    (method) => {
      const emitter = new EmitterImplementor();
      const laterListener = vi.fn();
      emitter.on('titleChanged', () => {
        throw undefined;
      });
      emitter.on('titleChanged', laterListener);

      let didThrow = false;
      let thrown: unknown;
      try {
        emitter[method]('titleChanged', 'title');
      } catch (error) {
        didThrow = true;
        thrown = error;
      }

      expect(didThrow).toBe(true);
      expect(thrown).toBeUndefined();
      expect(laterListener).toHaveBeenCalledOnce();
    },
  );

  it('preserves the first undefined all-event failure over a later failure', () => {
    const emitter = new EmitterImplementor();
    const laterFailure = new Error('later all-event failure');
    const laterListener = vi.fn(() => {
      throw laterFailure;
    });
    emitter.on(eventEmitterAllEventName, () => {
      throw undefined;
    });
    emitter.on(eventEmitterAllEventName, laterListener);

    let didThrow = false;
    let thrown: unknown;
    try {
      emitter.emit('titleChanged', 'title');
    } catch (error) {
      didThrow = true;
      thrown = error;
    }

    expect(didThrow).toBe(true);
    expect(thrown).toBeUndefined();
    expect(thrown).not.toBe(laterFailure);
    expect(laterListener).toHaveBeenCalledOnce();
  });

  it('unbinds events', function () {
    const myObject = new EmitterImplementor();
    const myListener: { titleCallback: () => void } = {
      titleCallback: () => void 0,
    };
    const titleCallbackSpy = vi.spyOn(myListener, 'titleCallback');
    myObject.on('titleChanged', myListener.titleCallback);
    expect(titleCallbackSpy).toHaveBeenCalledTimes(0);
    myObject.emit('titleChanged', 'new title');
    expect(titleCallbackSpy).toHaveBeenCalledTimes(1);
    myObject.unbind('titleChanged', myListener.titleCallback);
    myObject.emit('titleChanged', 'new title');
    expect(titleCallbackSpy).toHaveBeenCalledTimes(1);
  });

  it('throws an exception when trying to unsubscribe for a non existing method', function () {
    const myObject = new EmitterImplementor();
    const myListener: { callback: () => void } = { callback: () => void 0 };

    myObject.on('titleChanged', myListener.callback);

    expect(function () {
      myObject.unbind('titleChanged', () => void 0);
    }).toThrow();

    expect(function () {
      myObject.unbind(
        'doesNotExist' as unknown as 'titleChanged',
        myListener.callback,
      );
    }).toThrow();

    expect(function () {
      myObject.unbind('titleChanged', myListener.callback);
    }).not.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EventHub,
  type EventHubChildEventDetail,
  type LayoutManager,
} from '../../src';
import { UnexpectedUndefinedError } from '../../src/ts/errors/internal-error';

describe('EventHub ownership', () => {
  const hubs: EventHub[] = [];

  afterEach(() => {
    for (const hub of hubs) {
      hub.destroy();
    }
  });

  it('accepts child broadcasts only from popouts owned by its layout', () => {
    const ownedChild = {} as LayoutManager;
    const foreignChild = {} as LayoutManager;
    const getStrelitInstance = vi.fn<() => LayoutManager | undefined>();
    const layoutManager = {
      isSubWindow: false,
      openPopouts: [{ getStrelitInstance }],
    } as unknown as LayoutManager;
    const hub = new EventHub(layoutManager);
    hubs.push(hub);
    const listener = vi.fn();
    hub.on('userBroadcast', listener);
    const receive = (
      hub as unknown as {
        onEventFromChild(event: CustomEvent<EventHubChildEventDetail>): void;
      }
    ).onEventFromChild.bind(hub);

    getStrelitInstance.mockReturnValue(ownedChild);
    receive(
      new CustomEvent('strelit_child_event', {
        detail: {
          layoutManager: foreignChild,
          eventName: 'userBroadcast',
          args: ['foreign'],
        },
      }),
    );
    expect(listener).not.toHaveBeenCalled();

    getStrelitInstance
      .mockReturnValueOnce(ownedChild)
      .mockReturnValueOnce(undefined);
    receive(
      new CustomEvent('strelit_child_event', {
        detail: {
          layoutManager: ownedChild,
          eventName: 'userBroadcast',
          args: ['owned'],
        },
      }),
    );
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('owned');
  });

  it('does not swallow descendant dispatch errors as pending popouts', () => {
    const childLayoutManager = {
      isSubWindow: false,
      openPopouts: [],
    } as unknown as LayoutManager;
    const childHub = new EventHub(childLayoutManager);
    hubs.push(childHub);
    Object.defineProperty(childLayoutManager, 'eventHub', { value: childHub });
    childHub.on('userBroadcast', () => {
      throw new UnexpectedUndefinedError('TEST');
    });

    const parentLayoutManager = {
      isSubWindow: false,
      openPopouts: [{ getStrelitInstance: () => childLayoutManager }],
    } as unknown as LayoutManager;
    const parentHub = new EventHub(parentLayoutManager);
    hubs.push(parentHub);
    const propagate = (
      parentHub as unknown as {
        propagateToThisAndSubtree(name: string, args: unknown[]): void;
      }
    ).propagateToThisAndSubtree.bind(parentHub);

    expect(() => propagate('userBroadcast', [])).toThrow(
      UnexpectedUndefinedError,
    );
  });

  it('broadcasts to every other layout without echoing to the sender', () => {
    const childLayoutManager = {
      isSubWindow: true,
      openPopouts: [],
    } as unknown as LayoutManager;
    const childHub = new EventHub(childLayoutManager);
    hubs.push(childHub);
    Object.defineProperty(childLayoutManager, 'eventHub', { value: childHub });

    const siblingLayoutManager = {
      isSubWindow: true,
      openPopouts: [],
    } as unknown as LayoutManager;
    const siblingHub = new EventHub(siblingLayoutManager);
    hubs.push(siblingHub);
    Object.defineProperty(siblingLayoutManager, 'eventHub', {
      value: siblingHub,
    });

    const rootLayoutManager = {
      isSubWindow: false,
      openPopouts: [
        { getStrelitInstance: () => childLayoutManager },
        { getStrelitInstance: () => siblingLayoutManager },
      ],
    } as unknown as LayoutManager;
    const rootHub = new EventHub(rootLayoutManager);
    hubs.push(rootHub);
    Object.defineProperty(rootLayoutManager, 'eventHub', { value: rootHub });

    const senderListener = vi.fn();
    const rootListener = vi.fn();
    const siblingListener = vi.fn();
    childHub.on('userBroadcast', senderListener);
    rootHub.on('userBroadcast', rootListener);
    siblingHub.on('userBroadcast', siblingListener);

    const handleAtRoot = (
      rootHub as unknown as {
        handleUserBroadcastEvent(
          name: string,
          args: unknown[],
          origin: LayoutManager,
        ): void;
      }
    ).handleUserBroadcastEvent.bind(rootHub);
    handleAtRoot('userBroadcast', ['message'], childLayoutManager);

    expect(senderListener).not.toHaveBeenCalled();
    expect(rootListener).toHaveBeenCalledWith('message');
    expect(siblingListener).toHaveBeenCalledWith('message');

    senderListener.mockClear();
    rootListener.mockClear();
    siblingListener.mockClear();
    rootHub.emitUserBroadcast('from root');

    expect(rootListener).not.toHaveBeenCalled();
    expect(senderListener).toHaveBeenCalledWith('from root');
    expect(siblingListener).toHaveBeenCalledWith('from root');
  });

  it('skips an inaccessible cross-origin child and continues to later siblings', () => {
    const siblingLayoutManager = {
      isSubWindow: true,
      openPopouts: [],
    } as unknown as LayoutManager;
    const siblingHub = new EventHub(siblingLayoutManager);
    hubs.push(siblingHub);
    Object.defineProperty(siblingLayoutManager, 'eventHub', {
      value: siblingHub,
    });
    const siblingListener = vi.fn();
    siblingHub.on('userBroadcast', siblingListener);

    const rootLayoutManager = {
      isSubWindow: false,
      openPopouts: [
        {
          getStrelitInstance: () => {
            throw new DOMException('Blocked by origin policy', 'SecurityError');
          },
        },
        { getStrelitInstance: () => siblingLayoutManager },
      ],
    } as unknown as LayoutManager;
    const rootHub = new EventHub(rootLayoutManager);
    hubs.push(rootHub);
    Object.defineProperty(rootLayoutManager, 'eventHub', { value: rootHub });

    expect(() => rootHub.emitUserBroadcast('message')).not.toThrow();
    expect(siblingListener).toHaveBeenCalledWith('message');
  });
});

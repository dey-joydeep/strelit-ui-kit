import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComponentContainer,
  ComponentItem,
  StrelitLayout,
  LayoutConfig,
  resolveLayoutConfig,
  SerializableValue,
  Stack,
} from '../../src';

describe('Component State Saving & Initial State', function () {
  let layout: StrelitLayout;

  beforeEach(function () {
    layout = new StrelitLayout();
  });

  afterEach(function () {
    layout.destroy();
  });

  it('passes initial state to component and requests updated state on saveLayout', function () {
    let receivedInitialState: SerializableValue | undefined;

    layout.registerComponentFactoryFunction(
      'stateComponent',
      (container: ComponentContainer, state: SerializableValue | undefined) => {
        receivedInitialState = state;
        container.stateRequestEvent = () => ({ testValue: 'updated' });
      },
    );

    const config: LayoutConfig = {
      root: {
        type: 'component',
        componentType: 'stateComponent',
        componentState: { testValue: 'initial' },
      },
    };

    layout.loadLayout(config);

    expect(receivedInitialState).toEqual({ testValue: 'initial' });

    const savedConfig = layout.saveLayout();
    const savedRoot = savedConfig.root as any;
    expect(savedRoot.content[0].componentState).toEqual({
      testValue: 'updated',
    });
  });

  it('releases registered virtual ownership when its root was moved', function () {
    const externalHost = document.createElement('div');
    document.body.appendChild(externalHost);
    const rootHtmlElement = document.createElement('div');
    layout.registerComponentFactoryFunction(
      'virtualComponent',
      () => ({ rootHtmlElement }),
      true,
    );
    layout.loadLayout({
      root: { type: 'component', componentType: 'virtualComponent' },
    });
    const item = layout.getComponentItemsByType('virtualComponent')[0];
    externalHost.appendChild(rootHtmlElement);

    expect(() => item.remove()).not.toThrow();

    const internals = layout as unknown as {
      _registeredComponentMap: Map<ComponentContainer, unknown>;
      _virtualComponentMap: Map<ComponentContainer, unknown>;
    };
    expect(rootHtmlElement.isConnected).toBe(false);
    expect(internals._registeredComponentMap.has(item.container)).toBe(false);
    expect(internals._virtualComponentMap.has(item.container)).toBe(false);
    expect(item.container.virtualRectingRequiredEvent).toBeUndefined();
    expect(item.container.virtualVisibilityChangeRequiredEvent).toBeUndefined();
    expect(item.container.virtualZIndexChangeRequiredEvent).toBeUndefined();
    externalHost.remove();
  });

  it('does not repeat component release when item cleanup is retried', function () {
    layout.registerComponentFactoryFunction('component', () => undefined);
    layout.loadLayout({
      root: { type: 'component', componentType: 'component' },
    });
    const item = layout.getComponentItemsByType('component')[0];
    const unbindComponent = vi.spyOn(layout, 'unbindComponent');
    const failingReleaseObserver = vi.fn(() => {
      throw new Error('release observer failed');
    });
    const laterReleaseObserver = vi.fn();
    item.container.on('beforeComponentRelease', failingReleaseObserver);
    item.container.on('beforeComponentRelease', laterReleaseObserver);

    expect(() => item.destroy()).toThrow('release observer failed');
    expect(() => item.destroy()).not.toThrow();

    expect(failingReleaseObserver).toHaveBeenCalledOnce();
    expect(laterReleaseObserver).toHaveBeenCalledOnce();
    expect(unbindComponent).toHaveBeenCalledOnce();
  });

  it('emits container destroy only after a failed unbind is retried', function () {
    layout.registerComponentFactoryFunction('component', () => undefined);
    layout.loadLayout({
      root: { type: 'component', componentType: 'component' },
    });
    const item = layout.getComponentItemsByType('component')[0];
    const unbindComponent = vi
      .spyOn(layout, 'unbindComponent')
      .mockImplementationOnce(() => {
        throw new Error('unbind failed');
      });
    const destroyObserver = vi.fn();
    item.container.on('destroy', destroyObserver);

    expect(() => item.destroy()).toThrow('unbind failed');
    expect(destroyObserver).not.toHaveBeenCalled();

    expect(() => item.destroy()).not.toThrow();
    expect(unbindComponent).toHaveBeenCalledTimes(2);
    expect(destroyObserver).toHaveBeenCalledOnce();
  });

  it('returns a detached component-state snapshot', function () {
    const state = { nested: { value: 'saved' } };
    layout.registerComponentFactoryFunction('stateComponent', (container) => {
      container.stateRequestEvent = () => state;
    });
    layout.loadLayout({
      root: { type: 'component', componentType: 'stateComponent' },
    });

    const saved = layout.saveLayout();
    state.nested.value = 'mutated';

    const savedComponent = saved.root?.content[0] as
      { componentState: SerializableValue | undefined } | undefined;
    expect(savedComponent?.componentState).toEqual({
      nested: { value: 'saved' },
    });
  });

  it.each([
    {
      label: 'object',
      state: { nested: { value: 'initial' } },
      mutate: (state: { nested: { value: string } }) => {
        state.nested.value = 'mutated';
      },
      expected: { nested: { value: 'initial' } },
    },
    {
      label: 'array',
      state: [{ value: 'initial' }],
      mutate: (state: { value: string }[]) => {
        state[0].value = 'mutated';
      },
      expected: [{ value: 'initial' }],
    },
  ])(
    'detaches loaded $label state from the caller configuration',
    ({ state, mutate, expected }) => {
      layout.registerComponentFactoryFunction(
        'stateComponent',
        () => undefined,
      );
      layout.loadLayout({});
      const resolvedRoot = resolveLayoutConfig({
        root: {
          type: 'component',
          componentType: 'stateComponent',
          componentState: state,
        },
      }).root;
      if (
        resolvedRoot === undefined ||
        resolvedRoot.type !== 'component' ||
        layout.groundItem === undefined
      ) {
        throw new Error('Expected resolved root and ground item');
      }
      const createdItem = layout.createAndInitContentItem(
        resolvedRoot,
        layout.groundItem,
      );
      const item = (
        createdItem.isComponent ? createdItem : createdItem.contentItems[0]
      ) as ComponentItem;

      mutate(resolvedRoot.componentState as never);

      expect(item.container.initialState).toEqual(expected);
      expect(item.container.state).toEqual(expected);
      expect(item.toConfig().componentState).toEqual(expected);
      createdItem.destroy();
    },
  );

  it('uses requested live state when replacement binding rolls back', function () {
    const receivedStates: (SerializableValue | undefined)[] = [];
    let stateRequestCount = 0;
    layout.registerComponentFactoryFunction(
      'oldComponent',
      (container, state) => {
        receivedStates.push(state);
        container.stateRequestEvent =
          receivedStates.length === 1
            ? () => {
                stateRequestCount++;
                if (stateRequestCount > 1) {
                  throw new Error('live state requested twice');
                }
                return { source: 'live-state' };
              }
            : () => ({ source: 'live-state' });
      },
    );
    layout.registerComponentFactoryFunction('failingComponent', () => {
      throw new Error('replacement bind failed');
    });
    layout.loadLayout({
      root: {
        type: 'component',
        componentType: 'oldComponent',
        componentState: { source: 'initial-state' },
      },
    });
    const item = layout.getComponentItemsByType('oldComponent')[0];

    expect(() =>
      item.container.replaceComponent({
        type: 'component',
        componentType: 'failingComponent',
      }),
    ).toThrow('replacement bind failed');

    expect(receivedStates).toEqual([
      { source: 'initial-state' },
      { source: 'live-state' },
    ]);
    expect(stateRequestCount).toBe(1);
    const savedComponent = layout.saveLayout().root?.content[0] as
      { componentState: SerializableValue | undefined } | undefined;
    expect(savedComponent?.componentState).toEqual({
      source: 'live-state',
    });
  });

  it.each([
    {
      label: 'cyclic',
      create: () => {
        const state: Record<string, unknown> = {};
        state.self = state;
        return state;
      },
    },
    {
      label: 'unsupported',
      create: () => ({ callback: () => undefined }),
    },
    {
      label: 'non-finite',
      create: () => ({ value: Number.POSITIVE_INFINITY }),
    },
  ])(
    'keeps the current component bound when $label replacement state is invalid',
    ({ create }) => {
      layout.registerComponentFactoryFunction('oldComponent', () => undefined);
      layout.registerComponentFactoryFunction('newComponent', () => undefined);
      layout.loadLayout({
        root: {
          type: 'component',
          componentType: 'oldComponent',
          componentState: { source: 'working' },
        },
      });
      const item = layout.getComponentItemsByType('oldComponent')[0];

      expect(() =>
        item.container.replaceComponent({
          type: 'component',
          componentType: 'newComponent',
          componentState: create() as never,
        }),
      ).toThrow();

      expect(layout.getComponentItemsByType('oldComponent')).toEqual([item]);
      expect(layout.getComponentItemsByType('newComponent')).toEqual([]);
      expect(layout.saveLayout().root?.content[0]).toMatchObject({
        componentType: 'oldComponent',
        componentState: { source: 'working' },
      });
    },
  );

  it('clears the previous state request hook when replacing a component', function () {
    layout.registerComponentFactoryFunction('oldComponent', (container) => {
      container.stateRequestEvent = () => ({ source: 'old-hook' });
    });
    layout.registerComponentFactoryFunction('newComponent', () => undefined);
    layout.loadLayout({
      root: {
        type: 'component',
        componentType: 'oldComponent',
        componentState: { source: 'old-initial' },
      },
    });

    const oldItem = layout.getComponentItemsByType('oldComponent')[0];
    oldItem.container.replaceComponent({
      type: 'component',
      componentType: 'newComponent',
      componentState: { source: 'new-initial' },
    });

    const savedComponent = layout.saveLayout().root?.content[0] as
      | {
          componentType: unknown;
          componentState: SerializableValue | undefined;
        }
      | undefined;
    expect(savedComponent?.componentType).toBe('newComponent');
    expect(savedComponent?.componentState).toEqual({
      source: 'new-initial',
    });
  });

  it('applies replacement closability and reordering metadata', function () {
    layout.registerComponentFactoryFunction('oldComponent', () => undefined);
    layout.registerComponentFactoryFunction('newComponent', () => undefined);
    layout.loadLayout({
      root: {
        type: 'component',
        componentType: 'oldComponent',
        isClosable: true,
        reorderEnabled: true,
      },
    });

    const item = layout.getComponentItemsByType('oldComponent')[0];
    item.container.replaceComponent({
      type: 'component',
      componentType: 'newComponent',
      isClosable: false,
      reorderEnabled: false,
    });

    expect(item.isClosable).toBe(false);
    expect(item.reorderEnabled).toBe(false);
    expect(item.tab.reorderEnabled).toBe(false);
    expect(item.tab.closeElement?.style.display).toBe('none');
    item.container.close();
    expect(layout.getComponentItemsByType('newComponent')).toEqual([item]);
    expect(layout.saveLayout().root?.content[0]).toMatchObject({
      isClosable: false,
      reorderEnabled: false,
    });
  });

  it('uses the layout reorder default for replacement components', function () {
    layout.registerComponentFactoryFunction('oldComponent', () => undefined);
    layout.registerComponentFactoryFunction('newComponent', () => undefined);
    layout.loadLayout({
      settings: { reorderEnabled: false },
      root: { type: 'component', componentType: 'oldComponent' },
    });

    const item = layout.getComponentItemsByType('oldComponent')[0];
    item.container.replaceComponent({
      type: 'component',
      componentType: 'newComponent',
    });

    expect(item.reorderEnabled).toBe(false);
    expect(item.tab.reorderEnabled).toBe(false);
  });

  it('preserves maximised virtual-component presentation during replacement', function () {
    const roots: HTMLElement[] = [];
    for (const componentType of ['oldComponent', 'newComponent']) {
      layout.registerComponentFactoryFunction(
        componentType,
        () => {
          const rootHtmlElement = document.createElement('div');
          roots.push(rootHtmlElement);
          return { rootHtmlElement };
        },
        true,
      );
    }
    layout.loadLayout({
      root: {
        type: 'stack',
        content: [{ type: 'component', componentType: 'oldComponent' }],
      },
    });
    const stack = layout.rootItem as Stack;
    stack.maximise();
    const item = layout.getComponentItemsByType('oldComponent')[0];
    const maximisedZIndex = roots[0].style.zIndex;

    item.container.replaceComponent({
      type: 'component',
      componentType: 'newComponent',
    });

    expect(layout.maximisedStack).toBe(stack);
    expect(roots[1].style.zIndex).toBe(maximisedZIndex);
    expect(roots[1].style.zIndex).not.toBe('');
  });

  it('restores maximised presentation when replacement metadata rollback also fails', function () {
    const roots: HTMLElement[] = [];
    const oldComponents: object[] = [];
    for (const componentType of ['oldComponent', 'newComponent']) {
      layout.registerComponentFactoryFunction(
        componentType,
        () => {
          const rootHtmlElement = document.createElement('div');
          roots.push(rootHtmlElement);
          const component = { rootHtmlElement };
          if (componentType === 'oldComponent') {
            oldComponents.push(component);
          }
          return component;
        },
        true,
      );
    }
    layout.loadLayout({
      root: {
        type: 'stack',
        content: [
          {
            type: 'component',
            componentType: 'oldComponent',
            title: 'Old',
          },
        ],
      },
    });
    const stack = layout.rootItem as Stack;
    stack.maximise();
    const item = layout.getComponentItemsByType('oldComponent')[0];
    const maximisedZIndex = roots[0].style.zIndex;
    let metadataObserverFailed = false;
    vi.spyOn(
      layout as unknown as {
        handleContainerVirtualZIndexChangeRequiredEvent(): void;
      },
      'handleContainerVirtualZIndexChangeRequiredEvent',
    ).mockImplementation(() => {
      if (metadataObserverFailed) {
        throw new Error('z-index restoration failed');
      }
    });
    item.on('titleChanged', () => {
      metadataObserverFailed = true;
      throw new Error('metadata observer failed');
    });

    expect(() =>
      item.container.replaceComponent({
        type: 'component',
        componentType: 'newComponent',
        title: 'New',
      }),
    ).toThrow('metadata observer failed');

    expect(layout.maximisedStack).toBe(stack);
    expect(item.componentType).toBe('oldComponent');
    expect(item.container.component).toBe(oldComponents[1]);
    expect(layout.getComponentItemsByType('oldComponent')).toEqual([item]);
    expect(roots[2].style.zIndex).not.toBe(maximisedZIndex);
    metadataObserverFailed = false;
  });

  it('keeps a successfully rebound component owned when maximised presentation restoration fails', function () {
    const oldComponents: object[] = [];
    let replacementBindFailed = false;
    layout.registerComponentFactoryFunction(
      'oldComponent',
      () => {
        const component = { rootHtmlElement: document.createElement('div') };
        oldComponents.push(component);
        return component;
      },
      true,
    );
    layout.registerComponentFactoryFunction('failingComponent', () => {
      replacementBindFailed = true;
      throw new Error('replacement bind failed');
    });
    layout.loadLayout({
      root: {
        type: 'stack',
        content: [{ type: 'component', componentType: 'oldComponent' }],
      },
    });
    const stack = layout.rootItem as Stack;
    stack.maximise();
    const item = layout.getComponentItemsByType('oldComponent')[0];
    vi.spyOn(
      layout as unknown as {
        handleContainerVirtualZIndexChangeRequiredEvent(): void;
      },
      'handleContainerVirtualZIndexChangeRequiredEvent',
    ).mockImplementation(() => {
      if (replacementBindFailed) {
        throw new Error('z-index restoration failed');
      }
    });

    expect(() =>
      item.container.replaceComponent({
        type: 'component',
        componentType: 'failingComponent',
      }),
    ).toThrow('replacement bind failed');

    expect(oldComponents).toHaveLength(2);
    expect(item.container.component).toBe(oldComponents[1]);
    expect(item.componentType).toBe('oldComponent');
    expect(layout.getComponentItemsByType('oldComponent')).toEqual([item]);
    replacementBindFailed = false;
  });
});

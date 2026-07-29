import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ComponentContainer,
  ComponentItem,
  StrelitLayout,
  LayoutConfig,
  resolveLayoutConfig,
  SerializableValue,
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

    expect(saved.root?.content[0].componentState).toEqual({
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
    expect(layout.saveLayout().root?.content[0].componentState).toEqual({
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

    const savedRoot = layout.saveLayout().root;
    expect(savedRoot?.content[0].componentType).toBe('newComponent');
    expect(savedRoot?.content[0].componentState).toEqual({
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
});

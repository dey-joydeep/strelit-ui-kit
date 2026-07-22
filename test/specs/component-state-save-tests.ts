import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ComponentContainer,
  StrelitLayout,
  LayoutConfig,
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
});

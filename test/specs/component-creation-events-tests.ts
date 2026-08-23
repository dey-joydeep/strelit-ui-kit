import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComponentContainer,
  StrelitLayout,
  LayoutConfig,
  resolveComponentItemConfig,
} from '../../src';

describe('component creation events', function () {
  let layout: StrelitLayout;

  beforeEach(function () {
    layout = new StrelitLayout();

    function Recorder(container: ComponentContainer) {
      const span = document.createElement('span');
      span.innerText = 'that worked';
      container.element.appendChild(span);
    }

    layout.registerComponentFactoryFunction('testComponent', Recorder);
  });

  afterEach(function () {
    layout.destroy();
  });

  it('emits specific and general creation events when items are created from layout config', function () {
    const itemCreated = vi.fn();
    const stackCreated = vi.fn();
    const rowCreated = vi.fn();
    const columnCreated = vi.fn();
    const componentCreated = vi.fn();

    layout.addEventListener('itemCreated', itemCreated);
    layout.addEventListener('stackCreated', stackCreated);
    layout.addEventListener('rowCreated', rowCreated);
    layout.addEventListener('columnCreated', columnCreated);
    layout.addEventListener('componentCreated', componentCreated);

    const config: LayoutConfig = {
      root: {
        type: 'column',
        content: [
          {
            type: 'row',
            content: [
              {
                type: 'stack',
                content: [
                  {
                    type: 'component',
                    componentType: 'testComponent',
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    layout.loadLayout(config);

    expect(itemCreated).toHaveBeenCalledTimes(4); // column, row, stack, component
    expect(columnCreated).toHaveBeenCalledTimes(1);
    expect(rowCreated).toHaveBeenCalledTimes(1);
    expect(stackCreated).toHaveBeenCalledTimes(1);
    expect(componentCreated).toHaveBeenCalledTimes(1);
  });

  it('returns an immutable registration snapshot', function () {
    const config = resolveComponentItemConfig({
      type: 'component',
      componentType: 'testComponent',
    });
    const registration = layout.getComponentInstantiator(config);

    expect(registration).toBeDefined();
    expect(Object.isFrozen(registration)).toBe(true);
    expect(() => {
      (registration as { factoryFunction: undefined }).factoryFunction =
        undefined;
    }).toThrow(TypeError);

    expect(() =>
      layout.loadLayout({
        root: { type: 'component', componentType: 'testComponent' },
      }),
    ).not.toThrow();
  });

  it('exposes replacement metadata while binding the replacement component', function () {
    const replacementState = { source: 'replacement' };
    const observedMetadata: unknown[] = [];
    layout.registerComponentFactoryFunction(
      'replacementComponent',
      (container) => {
        observedMetadata.push(container.componentType, container.initialState);
      },
    );
    layout.loadLayout({
      root: {
        type: 'component',
        componentType: 'testComponent',
        componentState: { source: 'initial' },
      },
    });

    const componentItem = layout.getComponentItemsByType('testComponent')[0];
    componentItem.container.replaceComponent({
      type: 'component',
      componentType: 'replacementComponent',
      componentState: replacementState,
    });

    expect(observedMetadata).toEqual([
      'replacementComponent',
      replacementState,
    ]);
  });

  it('installs the replacement before publishing its item metadata', function () {
    const replacementComponent = { source: 'replacement' };
    layout.registerComponentFactoryFunction(
      'replacementComponent',
      () => replacementComponent,
    );
    layout.loadLayout({
      root: {
        type: 'component',
        componentType: 'testComponent',
        title: 'Initial',
      },
    });
    const componentItem = layout.getComponentItemsByType('testComponent')[0];
    const observedComponent = vi.fn();
    componentItem.on('titleChanged', () => {
      observedComponent(
        componentItem.container.component,
        componentItem.container.componentType,
      );
    });

    componentItem.container.replaceComponent({
      type: 'component',
      componentType: 'replacementComponent',
      title: 'Replacement',
    });

    expect(observedComponent).toHaveBeenCalledWith(
      replacementComponent,
      'replacementComponent',
    );
  });

  it('restores the previous binding when a metadata observer rejects replacement', function () {
    const initialComponent = { source: 'initial' };
    const replacementComponent = { source: 'replacement' };
    layout.registerComponentFactoryFunction(
      'statefulInitial',
      () => initialComponent,
    );
    layout.registerComponentFactoryFunction(
      'replacementComponent',
      () => replacementComponent,
    );
    layout.loadLayout({
      root: {
        type: 'component',
        componentType: 'statefulInitial',
        componentState: { value: 'initial' },
        title: 'Initial',
      },
    });
    const componentItem = layout.getComponentItemsByType('statefulInitial')[0];
    componentItem.on('titleChanged', () => {
      throw new Error('observer rejected replacement');
    });

    expect(() =>
      componentItem.container.replaceComponent({
        type: 'component',
        componentType: 'replacementComponent',
        componentState: { value: 'replacement' },
        title: 'Replacement',
      }),
    ).toThrow('observer rejected replacement');

    expect(componentItem.container.component).toBe(initialComponent);
    expect(componentItem.container.componentType).toBe('statefulInitial');
    expect(componentItem.container.state).toEqual({ value: 'initial' });
    expect(componentItem.title).toBe('Initial');
  });

  it('does not report old metadata when releasing a rejected replacement fails', function () {
    const initialComponent = { source: 'initial' };
    const replacementComponent = { source: 'replacement' };
    layout.registerComponentFactoryFunction(
      'statefulInitial',
      () => initialComponent,
    );
    layout.registerComponentFactoryFunction(
      'replacementComponent',
      () => replacementComponent,
    );
    layout.loadLayout({
      root: {
        type: 'component',
        componentType: 'statefulInitial',
        title: 'Initial',
      },
    });
    const componentItem = layout.getComponentItemsByType('statefulInitial')[0];
    const originalUnbind = layout.unbindComponent.bind(layout);
    let unbindCount = 0;
    vi.spyOn(layout, 'unbindComponent').mockImplementation(
      (container, virtual, component) => {
        if (++unbindCount === 2) {
          throw new Error('replacement release failed');
        }
        originalUnbind(container, virtual, component);
      },
    );
    componentItem.on('titleChanged', () => {
      throw new Error('observer rejected replacement');
    });

    expect(() =>
      componentItem.container.replaceComponent({
        type: 'component',
        componentType: 'replacementComponent',
        title: 'Replacement',
      }),
    ).toThrow('replacement release failed');

    expect(componentItem.container.component).toBe(replacementComponent);
    expect(componentItem.container.componentType).toBe('replacementComponent');
  });

  it('surfaces a failed previous-component rebind as an unbound rollback', function () {
    const initialComponent = { source: 'initial' };
    let initialBindCount = 0;
    layout.registerComponentFactoryFunction('statefulInitial', () => {
      if (++initialBindCount > 1) {
        throw new Error('previous rebind failed');
      }
      return initialComponent;
    });
    layout.registerComponentFactoryFunction('replacementComponent', () => ({
      source: 'replacement',
    }));
    layout.loadLayout({
      root: {
        type: 'component',
        componentType: 'statefulInitial',
        title: 'Initial',
      },
    });
    const componentItem = layout.getComponentItemsByType('statefulInitial')[0];
    componentItem.on('titleChanged', () => {
      throw new Error('observer rejected replacement');
    });

    expect(() =>
      componentItem.container.replaceComponent({
        type: 'component',
        componentType: 'replacementComponent',
        title: 'Replacement',
      }),
    ).toThrow('previous rebind failed');

    expect(componentItem.container.component).toBeUndefined();
    expect(componentItem.container.componentType).toBe('statefulInitial');
  });
});

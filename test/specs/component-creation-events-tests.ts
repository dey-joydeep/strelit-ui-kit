import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentContainer, StrelitLayout, LayoutConfig } from '../../src';

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
});

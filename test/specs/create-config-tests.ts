import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  type ComponentItemConfig,
  type LayoutConfig,
  type PopoutLayoutConfig,
  type RowOrColumnItemConfig,
  type StackItemConfig,
  createLayoutConfigFromResolved,
  createResolvedLayoutConfigCopy,
  createResolvedLayoutConfigDefault,
  createResolvedStackItemConfigDefault,
  resolveComponentItemConfig,
  resolveLayoutConfig,
  resolveRowOrColumnItemConfig,
  resolveStackItemConfig,
} from '../../src';
import { createResolvedStackItemConfigCopy } from '../../src/ts/config/resolved-config';

describe('Layout configuration resolution and defaults', function () {
  it('recomputes stack activeItemIndex when copying replacement content', function () {
    const resolved = resolveLayoutConfig({
      root: {
        type: 'stack',
        activeItemIndex: 1,
        content: [
          { type: 'component', componentType: 'first' },
          { type: 'component', componentType: 'second' },
        ],
      },
    });
    if (resolved.root?.type !== 'stack') {
      throw new Error('Expected a stack root');
    }

    const oneItemCopy = createResolvedStackItemConfigCopy(
      resolved.root,
      resolved.root.content.slice(0, 1),
    );
    const emptyCopy = createResolvedStackItemConfigCopy(resolved.root, []);

    expect(oneItemCopy.activeItemIndex).toBe(0);
    expect(emptyCopy.activeItemIndex).toBeUndefined();
  });

  it('uses undefined activeItemIndex for empty resolved stacks', function () {
    const resolved = resolveLayoutConfig({
      root: { type: 'stack', content: [], activeItemIndex: 4 },
    });
    const defaultStack = createResolvedStackItemConfigDefault();

    if (resolved.root?.type !== 'stack') {
      throw new Error('Expected a stack root');
    }
    expect(resolved.root.activeItemIndex).toBeUndefined();
    expect(defaultStack.content).toEqual([]);
    expect(defaultStack.activeItemIndex).toBeUndefined();
    const roundTrippedRoot = resolveLayoutConfig(
      createLayoutConfigFromResolved(resolved),
    ).root;
    expect(roundTrippedRoot?.type).toBe('stack');
    expect(
      roundTrippedRoot?.type === 'stack'
        ? roundTrippedRoot.activeItemIndex
        : undefined,
    ).toBeUndefined();
  });

  it("doesn't mutate default configuration when resolving custom layout configs", function () {
    const defaultConfig = createResolvedLayoutConfigDefault();
    expect(defaultConfig.dimensions.borderWidth).toBe(5);

    const customConfig: LayoutConfig = {
      dimensions: {
        borderWidth: 10,
      },
    };

    const resolved = resolveLayoutConfig(customConfig);

    expect(defaultConfig.dimensions.borderWidth).toBe(5);
    expect(resolved.dimensions.borderWidth).toBe(10);
  });

  it('returns independent objects for every default layout config', function () {
    const first = createResolvedLayoutConfigDefault();
    const second = createResolvedLayoutConfigDefault();

    expect(first.settings).not.toBe(second.settings);
    expect(first.dimensions).not.toBe(second.dimensions);
    expect(first.header).not.toBe(second.header);
    (
      first.settings as { constrainDragToContainer: boolean }
    ).constrainDragToContainer = false;
    expect(second.settings.constrainDragToContainer).toBe(true);
  });

  it('resolves explicit Strelit component and dimension fields', function () {
    const config: LayoutConfig = {
      root: {
        type: 'component',
        id: 'pane-a',
        maximised: true,
        componentType: 'strelitComponent',
        componentState: null,
      },
      dimensions: {
        defaultMinItemHeight: '25px',
        defaultMinItemWidth: '35px',
      },
    };

    const resolved = resolveLayoutConfig(config);
    const root = resolved.root;
    if (root?.type !== 'component') {
      throw new Error('Expected a component root');
    }
    expect(root.id).toBe('pane-a');
    expect(root.maximised).toBe(true);
    expect(root.componentType).toBe('strelitComponent');
    expect(root.componentState).toBeNull();
    expect(resolved.dimensions.defaultMinItemHeight).toBe(25);
    expect(resolved.dimensions.defaultMinItemWidth).toBe(35);
  });

  it('clones component state while resolving configuration', function () {
    const componentState = { nested: { value: 'initial' } };
    const resolved = resolveLayoutConfig({
      root: {
        type: 'component',
        componentType: 'stateful',
        componentState,
      },
    });

    componentState.nested.value = 'mutated';

    expect(resolved.root?.type).toBe('component');
    expect(
      resolved.root?.type === 'component'
        ? resolved.root.componentState
        : undefined,
    ).toEqual({ nested: { value: 'initial' } });
  });

  it('shares one clone budget across all component payloads in a layout', () => {
    const sharedState = Array(4_000).fill(null);
    const content = Array.from({ length: 3 }, (_, index) => ({
      type: 'component' as const,
      componentType: `panel-${index}`,
      componentState: sharedState,
    }));

    expect(() =>
      resolveLayoutConfig({ root: { type: 'stack', content } }),
    ).toThrow('Serializable value exceeds resource limits');
  });

  it('shares one clone budget across standalone component payloads', () => {
    expect(() =>
      resolveComponentItemConfig({
        type: 'component',
        componentType: Array(6_000).fill(null),
        componentState: Array(6_000).fill(null),
      }),
    ).toThrow('Serializable value exceeds resource limits');
  });

  it('rejects non-component discriminants in standalone component resolution', () => {
    expect(() =>
      resolveComponentItemConfig({
        type: 'stack',
        componentType: 'panel',
      } as unknown as ComponentItemConfig),
    ).toThrow('Invalid ComponentItemConfig.type');
  });

  it('rejects wrong discriminants in sibling standalone item resolvers', () => {
    expect(() =>
      resolveStackItemConfig({
        type: 'component',
        componentType: 'panel',
      } as unknown as StackItemConfig),
    ).toThrow('Invalid StackItemConfig.type');
    expect(() =>
      resolveRowOrColumnItemConfig({
        type: 'stack',
        content: [],
      } as unknown as RowOrColumnItemConfig),
    ).toThrow('Invalid RowOrColumnItemConfig.type');
  });

  it.each([null, undefined])(
    'preserves controlled diagnostics for malformed standalone item %s',
    (itemConfig) => {
      expect(() =>
        resolveComponentItemConfig(
          itemConfig as unknown as ComponentItemConfig,
        ),
      ).toThrow('Layout item configuration must be an object');
      expect(() =>
        resolveStackItemConfig(itemConfig as unknown as StackItemConfig),
      ).toThrow('Layout item configuration must be an object');
      expect(() =>
        resolveRowOrColumnItemConfig(
          itemConfig as unknown as RowOrColumnItemConfig,
        ),
      ).toThrow('Layout item configuration must be an object');
    },
  );

  it.each([
    'borderWidth',
    'borderGrabWidth',
    'headerHeight',
    'dragProxyWidth',
    'dragProxyHeight',
  ] as const)('rejects invalid numeric %s dimensions', (dimension) => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        resolveLayoutConfig({ dimensions: { [dimension]: value } }),
      ).toThrow(ConfigurationError);
    }

    expect(
      resolveLayoutConfig({ dimensions: { [dimension]: 0 } }).dimensions[
        dimension
      ],
    ).toBe(0);
  });

  it('preserves fractional size strings during resolution', function () {
    const resolved = resolveLayoutConfig({
      root: {
        type: 'row',
        content: [
          {
            type: 'component',
            componentType: 'fractionalComponent',
            size: '33.3%',
          },
          {
            type: 'component',
            componentType: 'fractionalComponent',
            size: '0.5fr',
          },
        ],
      },
    });

    const root = resolved.root;
    expect(root?.content[0].size).toBe(33.3);
    expect(root?.content[1].size).toBe(0.5);
  });

  it('rejects parsed sizes that overflow to infinity', function () {
    const overflowingSize = `${'9'.repeat(400)}%`;

    expect(() =>
      resolveLayoutConfig({
        root: {
          type: 'component',
          componentType: 'panel',
          size: overflowingSize,
        },
      }),
    ).toThrow(ConfigurationError);
  });

  it('rejects negative parsed sizes', function () {
    expect(() =>
      resolveLayoutConfig({
        root: {
          type: 'component',
          componentType: 'panel',
          minSize: '-10px',
        },
      }),
    ).toThrow(ConfigurationError);
  });

  it('preserves the popout unload policy', function () {
    expect(resolveLayoutConfig({}).settings.closePopoutsOnUnload).toBe(true);
    expect(
      resolveLayoutConfig({ settings: { closePopoutsOnUnload: false } })
        .settings.closePopoutsOnUnload,
    ).toBe(false);
  });

  it.each([
    { settings: { tabControlOffset: 'broken' } },
    { settings: { reorderEnabled: 'false' } },
    { settings: { responsiveMode: 'sometimes' } },
    { dimensions: 'broken' },
    { dimensions: { defaultMinItemHeight: 10 } },
    { dimensions: { defaultMinItemWidth: false } },
    { header: { show: 'center' } },
    { header: { minimise: false } },
    {
      root: { type: 'component', componentType: 'panel', isClosable: 'false' },
    },
    { root: { type: 'component', componentType: 'panel', reorderEnabled: 1 } },
    { root: { type: 'component', componentType: 'panel', title: false } },
    { root: { type: 'component', componentType: 'panel', size: 50 } },
    { root: { type: 'stack', content: [], activeItemIndex: '0' } },
    {
      openPopouts: [
        { parentId: 1, indexInParent: '0', window: { left: '10' } },
      ],
    },
    { openPopouts: [{ indexInParent: 0.5 }] },
  ])('rejects malformed primitive configuration %#', (config) => {
    expect(() => resolveLayoutConfig(config as never)).toThrow(
      ConfigurationError,
    );
  });

  it('applies popout defaults when optional runtime fields are omitted', () => {
    const popout = {
      root: { type: 'component', componentType: 'panel' },
    } as PopoutLayoutConfig;

    const resolved = resolveLayoutConfig({ openPopouts: [popout] });

    expect(resolved.openPopouts[0]).toMatchObject({
      parentId: null,
      indexInParent: null,
      window: { width: null, height: null, left: null, top: null },
    });
  });

  it.each([-2, 0, 3, null])(
    'preserves supported popout indexInParent value %s',
    (indexInParent) => {
      const resolved = resolveLayoutConfig({
        openPopouts: [{ indexInParent }],
      });

      expect(resolved.openPopouts[0].indexInParent).toBe(indexInParent);
    },
  );

  it('preserves fractional popout window coordinates', () => {
    const window = { width: 640.5, height: 480.25, left: -100.5, top: 50.75 };

    const resolved = resolveLayoutConfig({ openPopouts: [{ window }] });

    expect(resolved.openPopouts[0].window).toEqual(window);
  });

  it('maps resolved dock header labels back to public popin labels', () => {
    const resolved = resolveLayoutConfig({
      header: {
        popin: 'Dock me',
      },
    });

    const config = createLayoutConfigFromResolved(resolved);
    const reloaded = resolveLayoutConfig(config);

    expect(config.header?.popin).toBe('Dock me');
    expect(reloaded.header.dock).toBe('Dock me');
  });

  it('preserves item header dock labels through resolve and copy', () => {
    const resolved = resolveLayoutConfig({
      root: {
        type: 'stack',
        header: { dock: 'Dock this stack' },
        content: [{ type: 'component', componentType: 'panel' }],
      },
    });
    const copied = createResolvedLayoutConfigCopy(resolved);
    const publicConfig = createLayoutConfigFromResolved(copied);

    if (
      resolved.root?.type !== 'stack' ||
      copied.root?.type !== 'stack' ||
      publicConfig.root?.type !== 'stack'
    ) {
      throw new Error('Expected stack roots');
    }

    expect(resolved.root.header?.dock).toBe('Dock this stack');
    expect(copied.root.header?.dock).toBe('Dock this stack');
    expect(publicConfig.root.header?.dock).toBe('Dock this stack');
  });

  it('round-trips public popin labels for nested popouts', () => {
    const popout = {
      root: { type: 'component', componentType: 'panel' },
      header: { popin: 'Dock nested popout' },
    } as PopoutLayoutConfig;
    const resolved = resolveLayoutConfig({ openPopouts: [popout] });

    const config = createLayoutConfigFromResolved(resolved);
    const reloaded = resolveLayoutConfig(config);

    expect(config.openPopouts?.[0].header?.popin).toBe('Dock nested popout');
    expect(reloaded.openPopouts[0].header.dock).toBe('Dock nested popout');
  });

  it('rejects malformed openPopouts values', () => {
    expect(() =>
      resolveLayoutConfig({
        openPopouts: 'not-an-array',
      } as unknown as LayoutConfig),
    ).toThrow(ConfigurationError);
    expect(() =>
      resolveLayoutConfig({ openPopouts: {} } as unknown as LayoutConfig),
    ).toThrow(ConfigurationError);
  });

  it('deep-copies object component types when copying resolved configs', () => {
    const componentType = { kind: 'panel', metadata: ['left'] };
    const resolved = resolveLayoutConfig({
      root: {
        type: 'component',
        componentType,
      },
    });

    const copy = createResolvedLayoutConfigCopy(resolved);
    const copiedRoot = copy.root;
    if (copiedRoot?.type !== 'component') {
      throw new Error('Expected component root');
    }

    expect(copiedRoot.componentType).toEqual(componentType);
    expect(copiedRoot.componentType).not.toBe(componentType);
  });

  it('rejects malformed non-array content in layout configs', () => {
    expect(() =>
      resolveLayoutConfig({
        root: {
          type: 'row',
          content: {
            type: 'component',
            componentType: 'panel',
          },
        },
      } as unknown as LayoutConfig),
    ).toThrow(ConfigurationError);

    expect(() =>
      resolveLayoutConfig({
        root: {
          type: 'stack',
          content: {
            type: 'component',
            componentType: 'panel',
          },
        },
      } as unknown as LayoutConfig),
    ).toThrow(ConfigurationError);
  });

  it.each([
    null,
    { root: null },
    { root: { type: 'row', content: [null] } },
    { root: { type: 'unknown' } },
    { root: { type: 'component' } },
    {
      root: {
        type: 'stack',
        activeItemIndex: 0.5,
        content: [{ type: 'component', componentType: 'panel' }],
      },
    },
    {
      root: {
        type: 'stack',
        activeItemIndex: 1,
        content: [{ type: 'component', componentType: 'panel' }],
      },
    },
  ])('rejects malformed persisted item configuration %#', (config) => {
    expect(() =>
      resolveLayoutConfig(config as unknown as LayoutConfig),
    ).toThrow(ConfigurationError);
  });
});

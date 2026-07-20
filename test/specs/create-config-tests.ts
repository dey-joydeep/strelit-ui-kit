import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  type LayoutConfig,
  type PopoutLayoutConfig,
  createLayoutConfigFromResolved,
  createResolvedLayoutConfigCopy,
  createResolvedLayoutConfigDefault,
  resolveLayoutConfig,
} from '../../src';

describe('Layout configuration resolution and defaults', function () {
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
    expect(root?.id).toBe('pane-a');
    expect(root?.maximised).toBe(true);
    expect(root?.componentType).toBe('strelitComponent');
    expect(root?.componentState).toBeNull();
    expect(resolved.dimensions.defaultMinItemHeight).toBe(25);
    expect(resolved.dimensions.defaultMinItemWidth).toBe(35);
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

  it('preserves the popout unload policy', function () {
    expect(resolveLayoutConfig({}).settings.closePopoutsOnUnload).toBe(true);
    expect(
      resolveLayoutConfig({ settings: { closePopoutsOnUnload: false } })
        .settings.closePopoutsOnUnload,
    ).toBe(false);
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
});

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

    expect(resolved.root?.header?.dock).toBe('Dock this stack');
    expect(copied.root?.header?.dock).toBe('Dock this stack');
    expect(publicConfig.root?.header?.dock).toBe('Dock this stack');
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
});

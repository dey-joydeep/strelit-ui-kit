import { describe, expect, it } from 'vitest';
import { ResolvedLayoutConfig, LayoutConfig } from '../../src';

describe('Layout configuration resolution and defaults', function () {
  it("doesn't mutate default configuration when resolving custom layout configs", function () {
    const defaultConfig = ResolvedLayoutConfig.createDefault();
    expect(defaultConfig.dimensions.borderWidth).toBe(5);

    const customConfig: LayoutConfig = {
      dimensions: {
        borderWidth: 10,
      },
    };

    const resolved = LayoutConfig.resolve(customConfig);

    expect(defaultConfig.dimensions.borderWidth).toBe(5);
    expect(resolved.dimensions.borderWidth).toBe(10);
  });

  it('preserves legacy maximised ids, null component state, and deprecated min item dimensions', function () {
    const config: LayoutConfig = {
      content: [
        {
          type: 'component',
          id: ['pane-a', '__glMaximised'] as unknown as string,
          componentName: 'legacyComponent',
          componentState: null,
        },
      ],
      dimensions: {
        minItemHeight: 25,
        minItemWidth: 35,
      },
    };

    const resolved = LayoutConfig.resolve(config);
    const root = resolved.root;
    expect(root?.id).toBe('pane-a');
    expect(root?.maximised).toBe(true);
    expect(root?.componentType).toBe('legacyComponent');
    expect(root?.componentState).toBeNull();
    expect(resolved.dimensions.defaultMinItemHeight).toBe(25);
    expect(resolved.dimensions.defaultMinItemWidth).toBe(35);
  });

  it('preserves fractional size strings during resolution', function () {
    const resolved = LayoutConfig.resolve({
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
});

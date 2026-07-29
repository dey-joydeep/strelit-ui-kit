import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  createComponentItemConfigFromResolved,
  resolveItemConfig,
  resolveLayoutConfig,
  StrelitLayout,
  type ComponentItemConfig,
  type ResolvedItemConfig,
  type ResolvedRowOrColumnItemConfig,
  type RowOrColumnItemConfig,
  type SerializableValue,
} from '../../src';
import { deepCloneValue } from '../../src/ts/utils/utils';

const maximumDepth = 128;
const maximumNodes = 10_000;

function createNestedState(depth: number): SerializableValue {
  let state: SerializableValue = { leaf: true };
  for (let index = 0; index < depth; index++) {
    state = { next: state };
  }
  return state;
}

function createNestedLayout(depth: number): RowOrColumnItemConfig {
  let root: RowOrColumnItemConfig | ComponentItemConfig = {
    type: 'component',
    componentType: 'panel',
  };
  for (let index = 0; index < depth; index++) {
    root = { type: 'row', content: [root] };
  }
  return root as RowOrColumnItemConfig;
}

describe('configuration resource limits', () => {
  it('clones legitimate state without retaining mutable references', () => {
    const shared = { enabled: true };
    const source = {
      nested: shared,
      repeated: shared,
      values: [1, 2, 3],
    };

    const clone = deepCloneValue(source);

    expect(clone).toEqual(source);
    expect(clone).not.toBe(source);
    expect((clone as typeof source).nested).not.toBe(source.nested);
    expect((clone as typeof source).repeated).not.toBe(
      (clone as typeof source).nested,
    );
  });

  it('rejects component state beyond the depth and node budgets', () => {
    expect(() => deepCloneValue(createNestedState(maximumDepth + 1))).toThrow(
      ConfigurationError,
    );
    expect(() => deepCloneValue(Array(maximumNodes).fill(null))).toThrow(
      'Serializable value exceeds resource limits',
    );
  });

  it('rejects cyclic state with a controlled configuration error', () => {
    const cyclic: Record<string, SerializableValue> = {};
    cyclic.self = cyclic;

    expect(() => deepCloneValue(cyclic)).toThrow(
      'Serializable value contains a cycle',
    );
  });

  it('preserves __proto__ as an own data property without changing prototypes', () => {
    const source = JSON.parse(
      '{"__proto__":{"polluted":true},"safe":1}',
    ) as Record<string, SerializableValue>;

    const clone = deepCloneValue(source) as Record<string, SerializableValue>;

    expect(Object.hasOwn(clone, '__proto__')).toBe(true);
    expect(clone.__proto__).toEqual({ polluted: true });
    expect(Object.getPrototypeOf(clone)).toBe(Object.prototype);
    expect(
      (clone as Record<string, SerializableValue> & { polluted?: boolean })
        .polluted,
    ).toBeUndefined();
  });

  it('rejects values outside the serializable-value contract', () => {
    class CustomState {
      value = true;
    }

    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      () => undefined,
      Symbol('state'),
      1n,
      new Date(),
      new Map(),
      new CustomState(),
    ]) {
      expect(() => deepCloneValue(value)).toThrow('Value is not serializable');
    }
  });

  it('allows absent top-level state but rejects undefined within containers', () => {
    expect(deepCloneValue(undefined)).toBeUndefined();

    for (const value of [
      { nested: undefined },
      [undefined],
      Array(1),
      { nested: [{ value: undefined }] },
    ]) {
      expect(() => deepCloneValue(value)).toThrow('Value is not serializable');
    }
  });

  it('enforces the state budget through config copying and component binding', () => {
    const componentState = createNestedState(maximumDepth + 1);
    const resolved = resolveItemConfig({
      type: 'component',
      componentType: 'panel',
      componentState,
    });
    expect(() => createComponentItemConfigFromResolved(resolved)).toThrow(
      ConfigurationError,
    );

    const layout = new StrelitLayout();
    try {
      layout.registerComponentFactoryFunction('panel', () => undefined);
      expect(() =>
        layout.loadLayout({
          root: {
            type: 'component',
            componentType: 'panel',
            componentState,
          },
        }),
      ).toThrow(ConfigurationError);
    } finally {
      layout.destroy();
    }
  });

  it('rejects over-depth, over-width, and cyclic layout configurations', () => {
    expect(() =>
      resolveItemConfig(createNestedLayout(maximumDepth)),
    ).not.toThrow();
    expect(() =>
      resolveItemConfig(createNestedLayout(maximumDepth + 1)),
    ).toThrow('Layout configuration exceeds resource limits');

    const broad: RowOrColumnItemConfig = {
      type: 'row',
      content: Array.from({ length: maximumNodes }, (_, index) => ({
        type: 'component' as const,
        componentType: `panel-${index}`,
      })),
    };
    expect(() => resolveItemConfig(broad)).toThrow(
      'Layout configuration exceeds resource limits',
    );

    const cyclic = { type: 'row', content: [] } as RowOrColumnItemConfig;
    cyclic.content.push(cyclic);
    expect(() => resolveItemConfig(cyclic)).toThrow(
      'Layout configuration contains a cycle',
    );
  });

  it('shares the node budget across every popout in a layout', () => {
    const openPopouts = Array.from({ length: maximumNodes }, () => ({
      root: undefined,
      openPopouts: [],
      parentId: null,
      indexInParent: null,
      window: undefined,
    }));

    expect(() => resolveLayoutConfig({ openPopouts })).toThrow(
      'Layout configuration exceeds resource limits',
    );
  });

  it('defensively rejects an over-depth already-resolved construction tree', () => {
    const resolvedComponent = resolveItemConfig({
      type: 'component',
      componentType: 'panel',
    });
    const rowTemplate = resolveItemConfig({
      type: 'row',
      content: [{ type: 'component', componentType: 'panel' }],
    }) as ResolvedRowOrColumnItemConfig;
    let resolvedRoot: ResolvedItemConfig = resolvedComponent;
    for (let index = 0; index <= maximumDepth; index++) {
      resolvedRoot = { ...rowTemplate, content: [resolvedRoot] };
    }

    const layout = new StrelitLayout();
    try {
      const groundItem = layout.groundItem;
      expect(groundItem).toBeDefined();
      expect(() => layout.createContentItem(resolvedRoot, groundItem!)).toThrow(
        'Resolved layout configuration exceeds resource limits',
      );
    } finally {
      layout.destroy();
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  type LayoutConfig,
  type SerializableObject,
  minifyResolvedLayoutConfig,
  resolveLayoutConfig,
  unminifyResolvedLayoutConfig,
} from '../../src';
import { translateObject } from '../../src/ts/utils/config-minifier';

describe('resolved layout config minifier', function () {
  it('preserves unknown compact value tokens while unminifying', function () {
    expect(translateObject({ value: 'a' }, false)).toEqual({ value: 'a' });
    expect(translateObject({ value: 'z' }, false)).toEqual({ value: 'z' });
  });

  it('round-trips the maximum supported semantic layout depth', function () {
    let componentState: SerializableObject = { leaf: true };
    for (let depth = 0; depth < 128; depth++) {
      componentState = { next: componentState };
    }
    let root: NonNullable<LayoutConfig['root']> = {
      type: 'component',
      componentType: 'deep-component',
      componentState,
    };
    for (let depth = 0; depth < 128; depth++) {
      root = { type: 'row', content: [root] };
    }
    const resolved = resolveLayoutConfig({ root });

    const minified = minifyResolvedLayoutConfig(resolved);

    expect(unminifyResolvedLayoutConfig(minified)).toEqual(resolved);
  });

  it('round-trips combined maximum popout, layout, and state depth', function () {
    let componentState: SerializableObject = { leaf: true };
    for (let depth = 0; depth < 128; depth++) {
      componentState = { next: componentState };
    }
    let root: NonNullable<LayoutConfig['root']> = {
      type: 'component',
      componentType: 'deep-component',
      componentState,
    };
    for (let depth = 0; depth < 128; depth++) {
      root = { type: 'row', content: [root] };
    }
    let config: LayoutConfig = { root };
    for (let depth = 0; depth < 128; depth++) {
      config = {
        openPopouts: [{ ...config, parentId: null, indexInParent: null }],
      };
    }
    const resolved = resolveLayoutConfig(config);

    const minified = minifyResolvedLayoutConfig(resolved);

    expect(unminifyResolvedLayoutConfig(minified)).toEqual(resolved);
  });

  it('accepts the representation boundary and rejects the next level', function () {
    const createNestedArrays = (depth: number): Record<string, unknown> => {
      let value: unknown = true;
      for (let index = 0; index < depth; index++) {
        value = [value];
      }
      return { value };
    };

    expect(() => translateObject(createNestedArrays(648), true)).not.toThrow();
    expect(() => translateObject(createNestedArrays(649), true)).toThrow(
      /translation limit/i,
    );
  });

  it('minifies and unminifies a resolved configuration object accurately', function () {
    const config: LayoutConfig = {
      root: {
        type: 'row',
        content: [
          {
            type: 'stack',
            content: [
              {
                type: 'component',
                componentType: 'testComponent',
                title: 'My Component',
              },
            ],
          },
        ],
      },
    };

    const resolved = resolveLayoutConfig(config);
    const minified = minifyResolvedLayoutConfig(resolved);

    expect(minified).not.toBe(resolved);
    expect(typeof minified).toBe('object');

    const unminified = unminifyResolvedLayoutConfig(minified);
    expect(JSON.parse(JSON.stringify(unminified))).toEqual(
      JSON.parse(JSON.stringify(resolved)),
    );
  });

  it("doesn't change single character keys and values when minifying/unminifying arbitrary objects", function () {
    const conf: LayoutConfig = {
      root: {
        type: 'component',
        componentType: 'a',
        title: 'b',
      },
    };
    const resolved = resolveLayoutConfig(conf);
    const min = minifyResolvedLayoutConfig(resolved);
    const max = unminifyResolvedLayoutConfig(min);

    expect(JSON.parse(JSON.stringify(max))).toEqual(
      JSON.parse(JSON.stringify(resolved)),
    );
  });

  it("doesn't corrupt string values that naturally begin with ___", function () {
    const conf: LayoutConfig = {
      root: {
        type: 'component',
        componentType: '___token',
        componentState: {
          marker: '___stateToken',
          ___a: '___a',
          '~10': 'prefixed key',
        },
      },
    };
    const resolved = resolveLayoutConfig(conf);
    const min = minifyResolvedLayoutConfig(resolved);
    const max = unminifyResolvedLayoutConfig(min);

    expect(JSON.parse(JSON.stringify(max))).toEqual(
      JSON.parse(JSON.stringify(resolved)),
    );
  });

  it('preserves strings that use reserved extended-value prefixes', function () {
    const resolved = resolveLayoutConfig({
      root: {
        type: 'component',
        componentType: '@10',
        componentState: { current: '~10', escaped: '___@10' },
      },
    });

    expect(
      unminifyResolvedLayoutConfig(minifyResolvedLayoutConfig(resolved)),
    ).toEqual(resolved);
  });

  it('round-trips config keys beyond the single-character index range', function () {
    const resolved = resolveLayoutConfig({
      settings: { closePopoutsOnUnload: false },
    });

    const minified = minifyResolvedLayoutConfig(resolved);
    expect(JSON.stringify(minified)).toContain('"~10":"1"');
    expect(unminifyResolvedLayoutConfig(minified)).toEqual(resolved);
  });

  it('round-trips own __proto__ component-state properties', function () {
    const componentState = JSON.parse(
      '{"__proto__":{"polluted":true},"safe":"value"}',
    ) as SerializableObject;
    const resolved = resolveLayoutConfig({
      root: {
        type: 'component',
        componentType: 'panel',
        componentState,
      },
    });

    const roundTripped = unminifyResolvedLayoutConfig(
      minifyResolvedLayoutConfig(resolved),
    );
    const root = roundTripped.root;
    expect(root?.type).toBe('component');
    if (root?.type !== 'component') {
      throw new Error('Expected component root');
    }
    const state = root.componentState as Record<string, unknown>;
    expect(Object.hasOwn(state, '__proto__')).toBe(true);
    expect(state.__proto__).toEqual({ polluted: true });
    expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
    expect(JSON.stringify(state)).toContain('"__proto__"');
  });

  it('allows shared non-cyclic objects while rejecting cyclic translation input', function () {
    const shared = { value: 'shared' };

    expect(() =>
      translateObject({ first: shared, second: shared }, true),
    ).not.toThrow();

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => translateObject(cyclic, true)).toThrow(/cyclic/i);
  });

  it('preserves depth-first getter evaluation order without duplicate reads', function () {
    const accessOrder: string[] = [];
    const nested = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => {
        accessOrder.push('nested');
        return true;
      },
    });
    const config = Object.defineProperties(
      {},
      {
        first: {
          enumerable: true,
          get: () => {
            accessOrder.push('first');
            return nested;
          },
        },
        second: {
          enumerable: true,
          get: () => {
            accessOrder.push('second');
            return false;
          },
        },
      },
    ) as Record<string, unknown>;

    translateObject(config, true);

    expect(accessOrder).toEqual(['first', 'nested', 'second']);
  });

  it('enforces the translation node limit for wide primitive arrays', function () {
    const withinLimit = { values: Array(9_998).fill(false) };
    const overLimit = { values: Array(9_999).fill(false) };

    expect(() => translateObject(withinLimit, true)).not.toThrow();
    expect(() => translateObject(overLimit, true)).toThrow(/limit/i);
    expect(() => unminifyResolvedLayoutConfig(overLimit as never)).toThrow(
      /limit/i,
    );

    expect(() => translateObject({ values: Array(9_998) }, true)).not.toThrow();
    expect(() => translateObject({ values: Array(9_999) }, true)).toThrow(
      /limit/i,
    );
  });
});

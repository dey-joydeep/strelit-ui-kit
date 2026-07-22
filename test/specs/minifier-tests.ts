import { describe, expect, it } from 'vitest';
import {
  type LayoutConfig,
  minifyResolvedLayoutConfig,
  resolveLayoutConfig,
  unminifyResolvedLayoutConfig,
} from '../../src';

describe('resolved layout config minifier', function () {
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
});

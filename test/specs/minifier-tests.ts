import { describe, expect, it } from 'vitest';
import { ResolvedLayoutConfig, LayoutConfig } from '../../src';

describe('Config Minifier (ResolvedLayoutConfig.minifyConfig / unminifyConfig)', function () {
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

        const resolved = LayoutConfig.resolve(config);
        const minified = ResolvedLayoutConfig.minifyConfig(resolved);

        expect(minified).not.toBe(resolved);
        expect(typeof minified).toBe('object');

        const unminified = ResolvedLayoutConfig.unminifyConfig(minified);
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
        const resolved = LayoutConfig.resolve(conf);
        const min = ResolvedLayoutConfig.minifyConfig(resolved);
        const max = ResolvedLayoutConfig.unminifyConfig(min);

        expect(JSON.parse(JSON.stringify(max))).toEqual(
            JSON.parse(JSON.stringify(resolved)),
        );
    });
});

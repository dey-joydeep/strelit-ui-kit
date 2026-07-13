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
});

import { afterAll, describe, expect, it } from 'vitest';
import { StrelitLayout, LayoutConfig } from '../../src';
import TestTools from './test-tools';

describe('ground item', function () {
    let layout: StrelitLayout;

    afterAll(function () {
        layout?.destroy();
    });

    it('component gets wrapped in a stack', function () {
        const rootLayout: LayoutConfig = {
            root: {
                type: 'component',
                componentType: TestTools.TEST_COMPONENT_NAME,
            },
        };

        layout = TestTools.createLayout(rootLayout);

        const glElements = document.querySelectorAll('.strelit_layout');
        expect(glElements.length).toBe(1);
        TestTools.verifyPath('stack.0.component', layout);
    });
});

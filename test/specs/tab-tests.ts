import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    ComponentContainer,
    StrelitLayout,
    LayoutConfig,
    Stack,
} from '../../src';

describe('Tabs configuration and behavior', function () {
    let layout: StrelitLayout;

    beforeEach(function () {
        layout = new StrelitLayout();
        layout.registerComponentFactoryFunction(
            'testComponent',
            (container: ComponentContainer) => {
                const span = document.createElement('span');
                span.innerText = 'tab content';
                container.element.appendChild(span);
            },
        );
    });

    afterEach(function () {
        layout.destroy();
    });

    it('applies reorderEnabled setting to tabs', function () {
        const config: LayoutConfig = {
            root: {
                type: 'stack',
                content: [
                    {
                        type: 'component',
                        componentType: 'testComponent',
                        reorderEnabled: true,
                    },
                    {
                        type: 'component',
                        componentType: 'testComponent',
                        reorderEnabled: false,
                    },
                ],
            },
        };

        layout.loadLayout(config);

        const stack = layout.rootItem as Stack;
        expect(stack).toBeDefined();
        expect(stack.header.tabs.length).toBe(2);

        expect(stack.header.tabs[0].reorderEnabled).toBe(true);
        expect(stack.header.tabs[1].reorderEnabled).toBe(false);
    });

    it('applies the bottom header class when header.show is bottom', function () {
        const config: LayoutConfig = {
            root: {
                type: 'stack',
                header: {
                    show: 'bottom',
                },
                content: [
                    {
                        type: 'component',
                        componentType: 'testComponent',
                    },
                ],
            },
        };

        layout.loadLayout(config);

        const stack = layout.rootItem as Stack;
        expect(stack.element.classList.contains('strelit_bottom')).toBe(true);
    });
});

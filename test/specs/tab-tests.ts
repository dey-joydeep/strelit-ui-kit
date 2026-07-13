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

    it('assigns integer zIndex string (without px units) when tabOverlapAllowance is used', function () {
        const config: LayoutConfig = {
            settings: {
                tabOverlapAllowance: 50,
            },
            root: {
                type: 'stack',
                content: [
                    {
                        type: 'component',
                        componentType: 'testComponent',
                        title: 'Tab 1',
                    },
                    {
                        type: 'component',
                        componentType: 'testComponent',
                        title: 'Tab 2',
                    },
                ],
            },
        };

        layout.loadLayout(config);
        const stack = layout.rootItem as Stack;
        const tabs = stack.header.tabs;
        expect(tabs.length).toBe(2);
        for (const tab of tabs) {
            const zIndex = tab.element.style.zIndex;
            if (zIndex && zIndex !== 'auto') {
                expect(zIndex).not.toContain('px');
                expect(Number.isInteger(Number(zIndex))).toBe(true);
            }
        }
    });
});

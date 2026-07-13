import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    ComponentContainer,
    StrelitLayout,
    LayoutConfig,
    Stack,
    ComponentItem,
} from '../../src';

describe('Content item titles and dynamic updates', function () {
    let layout: StrelitLayout;

    beforeEach(function () {
        layout = new StrelitLayout();
        layout.registerComponentFactoryFunction(
            'testComponent',
            (container: ComponentContainer) => {
                const span = document.createElement('span');
                span.innerText = 'content';
                container.element.appendChild(span);
            },
        );
    });

    afterEach(function () {
        layout.destroy();
    });

    it('applies titles from config, falls back to componentType, and updates dynamically', function () {
        const config: LayoutConfig = {
            root: {
                type: 'stack',
                content: [
                    {
                        type: 'component',
                        id: 'hasTitle',
                        componentType: 'testComponent',
                        title: 'First Title',
                    },
                    {
                        type: 'component',
                        id: 'noTitle',
                        componentType: 'testComponent',
                    },
                ],
            },
        };

        layout.loadLayout(config);

        const stack = layout.rootItem as Stack;
        expect(stack.header.tabs.length).toBe(2);

        expect(stack.header.tabs[0].titleElement.innerText).toBe('First Title');
        expect(stack.header.tabs[1].titleElement.innerText).toBe(
            'testComponent',
        );

        const itemWithTitle = layout.findFirstComponentItemById(
            'hasTitle',
        ) as ComponentItem;
        itemWithTitle.setTitle('Updated Title');

        expect(stack.header.tabs[0].titleElement.innerText).toBe(
            'Updated Title',
        );
    });

    it('safely sets titles containing HTML symbols via native innerText (preventing XSS)', function () {
        const config: LayoutConfig = {
            root: {
                type: 'stack',
                content: [
                    {
                        type: 'component',
                        componentType: 'testComponent',
                        title: '<script>alert(1)</script>',
                    },
                ],
            },
        };

        layout.loadLayout(config);

        const stack = layout.rootItem as Stack;
        expect(stack.header.tabs[0].titleElement.innerText).toBe(
            '<script>alert(1)</script>',
        );
        expect(stack.header.tabs[0].titleElement.children.length).toBe(0);
    });
});

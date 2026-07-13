import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComponentContainer, StrelitLayout, LayoutConfig } from '../../src';

describe('Creates the right structure based on the provided config', function () {
    let layout: StrelitLayout;

    beforeEach(function () {
        layout = new StrelitLayout();
        layout.registerComponentFactoryFunction(
            'testComponent',
            (container: ComponentContainer) => {
                const span = document.createElement('span');
                span.innerText = 'that worked';
                container.element.appendChild(span);
            },
        );
    });

    afterEach(function () {
        layout.destroy();
    });

    it('creates the right primitive types: component only (wrapped in stack)', function () {
        const config: LayoutConfig = {
            root: {
                type: 'component',
                componentType: 'testComponent',
            },
        };

        layout.loadLayout(config);

        expect(layout.rootItem).toBeDefined();
        const rootItem = layout.rootItem!;
        expect(rootItem.isStack).toBe(true);
        expect(rootItem.contentItems.length).toBe(1);
        expect(rootItem.contentItems[0].isComponent).toBe(true);
    });

    it('creates the right primitive types: explicit stack and component', function () {
        const config: LayoutConfig = {
            root: {
                type: 'stack',
                content: [
                    {
                        type: 'component',
                        componentType: 'testComponent',
                    },
                ],
            },
        };

        layout.loadLayout(config);

        expect(layout.rootItem).toBeDefined();
        const rootItem = layout.rootItem!;
        expect(rootItem.isStack).toBe(true);
        expect(rootItem.contentItems.length).toBe(1);
        expect(rootItem.contentItems[0].isComponent).toBe(true);
    });

    it('creates the right primitive types: row and two components', function () {
        const config: LayoutConfig = {
            root: {
                type: 'row',
                content: [
                    {
                        type: 'component',
                        componentType: 'testComponent',
                    },
                    {
                        type: 'component',
                        componentType: 'testComponent',
                    },
                ],
            },
        };

        layout.loadLayout(config);

        expect(layout.rootItem).toBeDefined();
        const rootItem = layout.rootItem!;
        expect(rootItem.isRow).toBe(true);
        expect(rootItem.contentItems.length).toBe(2);
        expect(rootItem.contentItems[0].isStack).toBe(true);
        expect(rootItem.contentItems[1].isStack).toBe(true);
        expect(rootItem.contentItems[0].contentItems[0].isComponent).toBe(true);
        expect(rootItem.contentItems[1].contentItems[0].isComponent).toBe(true);
    });

    it('creates nested structure: column -> stack -> component', function () {
        const config: LayoutConfig = {
            root: {
                type: 'column',
                content: [
                    {
                        type: 'stack',
                        content: [
                            {
                                type: 'component',
                                componentType: 'testComponent',
                            },
                        ],
                    },
                ],
            },
        };

        layout.loadLayout(config);

        expect(layout.rootItem).toBeDefined();
        const rootItem = layout.rootItem!;
        expect(rootItem.isColumn).toBe(true);
        expect(rootItem.contentItems.length).toBe(1);
        expect(rootItem.contentItems[0].isStack).toBe(true);
        expect(rootItem.contentItems[0].contentItems[0].isComponent).toBe(true);
    });
});

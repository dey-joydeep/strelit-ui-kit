import { expect } from 'vitest';
import {
    ComponentContainer,
    ContentItem,
    LayoutConfig,
    RowOrColumn,
    SerializableValue,
    StrelitLayout,
    Stack,
} from '../../src';

export default class TestTools {
    public static readonly TEST_COMPONENT_NAME = 'testComponent';

    public static createLayout(config: LayoutConfig): StrelitLayout {
        const myLayout = new StrelitLayout();

        myLayout.registerComponentFactoryFunction(
            this.TEST_COMPONENT_NAME,
            TestTools.createTestComponent,
        );

        myLayout.loadLayout(config);

        expect(myLayout.isInitialised).toBe(true);

        return myLayout;
    }

    public static createTestComponent(
        container: ComponentContainer,
        state?: SerializableValue,
    ): undefined {
        if (state === undefined) {
            const span = document.createElement('span');
            span.innerText = 'that worked';
            container.element.appendChild(span);
        } else if (state) {
            const html = (state as { html: string }).html;
            if (html) {
                container.element.outerHTML = html;
            }
        }
        return undefined;
    }

    /**
     * Takes a path of type.index.type.index, and returns the corresponding resolved item config
     *
     * @example
     * verifyPath('row.0.stack.1.component', layout)
     * // returns object of type ComponentItemConfig
     */
    public static verifyPath(path: string, layout: StrelitLayout): ContentItem {
        let rootItem = layout.rootItem;
        expect(rootItem).toBeTruthy();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        rootItem = rootItem!;

        const pathSegments = path.split('.');

        let node: ContentItem = rootItem;
        for (let i = 0; i < pathSegments.length; i++) {
            const pathSegment = pathSegments[i];
            const pathSegmentAsInt = parseInt(pathSegment, 10);

            if (isNaN(pathSegmentAsInt)) {
                expect(node.type).toBe(pathSegment);
            } else {
                expect(node.isStack || node.isRow || node.isColumn).toBe(true);
                node = (node as unknown as Stack | RowOrColumn).contentItems[
                    pathSegmentAsInt
                ];
                expect(node).toBeDefined();
            }
        }
        return node;
    }

    public static getDragProxy(): HTMLDivElement | null {
        // class copied from DomConstants.ClassName.DragProxy (could instead expose this in public API?)
        const dragProxy = document.querySelector(
            '.strelit_dragProxy',
        ) as HTMLDivElement;
        return dragProxy;
    }
}

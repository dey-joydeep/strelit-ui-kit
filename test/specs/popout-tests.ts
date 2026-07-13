import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ComponentContainer,
    StrelitLayout,
    LayoutConfig,
    ComponentItem,
} from '../../src';

describe('BrowserPopout functionality (item.popout())', function () {
    let layout: StrelitLayout;

    beforeEach(function () {
        layout = new StrelitLayout();
        layout.registerComponentFactoryFunction(
            'testComponent',
            (container: ComponentContainer) => {
                const span = document.createElement('span');
                span.innerText = 'popout test';
                container.element.appendChild(span);
            },
        );
    });

    afterEach(function () {
        layout.destroy();
    });

    it('creates a BrowserPopout and tracks open popouts', function () {
        const mockWindow = {
            closed: false,
            close: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            document: {
                createElement: () => document.createElement('div'),
                body: document.createElement('body'),
                head: document.createElement('head'),
                write: vi.fn(),
                close: vi.fn(),
            },
            location: { href: '' },
        } as unknown as Window;

        const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWindow);

        const config: LayoutConfig = {
            root: {
                type: 'stack',
                content: [
                    {
                        type: 'component',
                        id: 'compA',
                        componentType: 'testComponent',
                    },
                ],
            },
        };

        layout.loadLayout(config);

        expect(layout.openPopouts.length).toBe(0);

        const compA = layout.findFirstComponentItemById(
            'compA',
        ) as ComponentItem;
        expect(compA).toBeDefined();

        const popout = compA.popout();

        expect(openSpy).toHaveBeenCalled();
        expect(layout.openPopouts.length).toBe(1);
        expect(layout.openPopouts[0]).toBe(popout);

        openSpy.mockRestore();
    });
});

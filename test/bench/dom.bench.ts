/**
 * @vitest-environment jsdom
 */
import { bench, describe } from 'vitest';
import { StrelitLayout, LayoutConfig, ComponentContainer } from '../../src';

function buildGridConfig(rows: number, cols: number): LayoutConfig {
    const rowContents = [];
    for (let r = 0; r < rows; r++) {
        const colContents = [];
        for (let c = 0; c < cols; c++) {
            colContents.push({
                type: 'stack' as const,
                content: [
                    {
                        type: 'component' as const,
                        componentType: 'benchComp',
                        title: `R${r}C${c}`,
                    },
                ],
            });
        }
        rowContents.push({
            type: 'column' as const,
            content: colContents,
        });
    }

    return {
        root: {
            type: 'row' as const,
            content: rowContents,
        },
    };
}

const config16 = buildGridConfig(4, 4); // 16 components

describe('Strelit UI Kit — DOM Initialization & Reflow Benchmarks (JSDOM)', () => {
    bench(
        'StrelitLayout.loadLayout() — 16 Component Grid Init & Destroy',
        () => {
            const container = document.createElement('div');
            const layout = new StrelitLayout(container);
            layout.registerComponentFactoryFunction(
                'benchComp',
                (c: ComponentContainer) => {
                    const div = document.createElement('div');
                    div.innerText = c.title;
                    c.element.appendChild(div);
                },
            );

            layout.loadLayout(config16);
            layout.destroy();
        },
    );

    bench('StrelitLayout.updateSize() — Layout Resizing Reflow', () => {
        const container = document.createElement('div');
        const layout = new StrelitLayout(container);
        layout.registerComponentFactoryFunction(
            'benchComp',
            (c: ComponentContainer) => {
                const div = document.createElement('div');
                div.innerText = c.title;
                c.element.appendChild(div);
            },
        );
        layout.loadLayout(config16);
        layout.updateSize(1024, 768);
        layout.destroy();
    });
});

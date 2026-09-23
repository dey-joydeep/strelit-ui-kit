/**
 * @vitest-environment jsdom
 */
import { createRequire } from 'node:module';
import { test, describe } from 'vitest';
import type { LayoutConfig, ComponentContainer } from '../../src';

const require = createRequire(import.meta.url);
const { StrelitLayout } =
  require('strelit-ui-kit') as typeof import('../../src');

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
  test('StrelitLayout.loadLayout() — 16 Component Grid Init & Destroy', async ({
    bench,
  }) => {
    await bench('loadLayout and destroy', () => {
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
    }).run();
    // The default 64 DOM samples can take minutes on shared Windows hosts.
  }, 300_000);

  test('StrelitLayout.setSize() — Layout Resizing Reflow', async ({
    bench,
  }) => {
    await bench('loadLayout, setSize and destroy', () => {
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
      layout.setSize(1024, 768);
      layout.destroy();
    }).run();
  }, 300_000);
});

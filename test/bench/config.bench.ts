import { createRequire } from 'node:module';
import { test, describe } from 'vitest';
import type * as StrelitModule from '../../src';

const require = createRequire(import.meta.url);
const {
  minifyResolvedLayoutConfig,
  resolveLayoutConfig,
  unminifyResolvedLayoutConfig,
} = require('strelit-ui-kit') as typeof StrelitModule;
type LayoutConfig = StrelitModule.LayoutConfig;

function createLargeGridConfig(rows: number, cols: number): LayoutConfig {
  const rowContents = [];
  for (let r = 0; r < rows; r++) {
    const colContents = [];
    for (let c = 0; c < cols; c++) {
      colContents.push({
        type: 'stack' as const,
        content: [
          {
            type: 'component' as const,
            componentType: 'benchmarkComponent',
            title: `R${r}C${c}`,
            componentState: {
              row: r,
              col: c,
              data: Array(20).fill(r + c),
            },
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

const largeConfig = createLargeGridConfig(10, 10); // 100 components
const resolvedConfig = resolveLayoutConfig(largeConfig);
const minifiedConfig = minifyResolvedLayoutConfig(resolvedConfig);

describe('Strelit UI Kit - Core Algorithmic Benchmarks (100-Component Layout)', () => {
  test('resolveLayoutConfig(100 components)', async ({ bench }) => {
    await bench('resolveLayoutConfig', () => {
      resolveLayoutConfig(largeConfig);
    }).run();
  });

  test('minifyResolvedLayoutConfig(100 components)', async ({ bench }) => {
    await bench('minifyResolvedLayoutConfig', () => {
      minifyResolvedLayoutConfig(resolvedConfig);
    }).run();
  });

  test('unminifyResolvedLayoutConfig(100 components)', async ({ bench }) => {
    await bench('unminifyResolvedLayoutConfig', () => {
      unminifyResolvedLayoutConfig(minifiedConfig);
    }).run();
  });
});

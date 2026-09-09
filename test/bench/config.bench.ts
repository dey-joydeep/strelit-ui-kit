import { bench, describe } from 'vitest';
import {
  type LayoutConfig,
  minifyResolvedLayoutConfig,
  resolveLayoutConfig,
  unminifyResolvedLayoutConfig,
} from '../../src';

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
  bench('resolveLayoutConfig(100 components)', () => {
    resolveLayoutConfig(largeConfig);
  });

  bench('minifyResolvedLayoutConfig(100 components)', () => {
    minifyResolvedLayoutConfig(resolvedConfig);
  });

  bench('unminifyResolvedLayoutConfig(100 components)', () => {
    unminifyResolvedLayoutConfig(minifiedConfig);
  });
});

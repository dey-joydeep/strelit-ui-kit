import { bench, describe } from 'vitest';
import { LayoutConfig, ResolvedLayoutConfig } from '../../src';

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
              data: new Array(20).fill(r + c),
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
const resolvedConfig = LayoutConfig.resolve(largeConfig);
const minifiedConfig = ResolvedLayoutConfig.minifyConfig(resolvedConfig);

describe('Strelit UI Kit - Core Algorithmic Benchmarks (100-Component Layout)', () => {
  bench('LayoutConfig.resolve(100 components)', () => {
    LayoutConfig.resolve(largeConfig);
  });

  bench('ResolvedLayoutConfig.minifyConfig(100 components)', () => {
    ResolvedLayoutConfig.minifyConfig(resolvedConfig);
  });

  bench('ResolvedLayoutConfig.unminifyConfig(100 components)', () => {
    ResolvedLayoutConfig.unminifyConfig(minifiedConfig);
  });
});

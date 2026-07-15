import { defineConfig } from 'tsup';

const shared = {
  bundle: true,
  clean: false,
  dts: false,
  entry: ['src/index.ts'],
  external: ['tslib'],
  minify: false,
  skipNodeModulesBundle: true,
  sourcemap: true,
  splitting: false,
  target: 'es2020',
  treeshake: true,
} as const;

export default defineConfig([
  {
    ...shared,
    format: ['cjs'],
    outDir: 'dist/cjs',
  },
  {
    ...shared,
    format: ['esm'],
    outDir: 'dist/esm',
  },
]);

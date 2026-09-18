import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: path.resolve(__dirname, 'apitest'),
  resolve: {
    alias: {
      'component-base': path.resolve(__dirname, 'apitest/component-base.ts'),
    },
  },
  server: {
    port: 3000,
    fs: {
      allow: [path.resolve(__dirname)],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/vitest.setup.ts'],
    include: ['test/specs/**/*-tests.ts'],
    // jsdom workers are memory-heavy; bounded concurrency keeps CI and
    // developer verification reliable on shared hosts.
    maxWorkers: 1,
    testTimeout: 60_000,
    globals: false,
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/ts/**/*.ts'],
    },
  },
});

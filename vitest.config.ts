import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./test/vitest.setup.ts'],
        include: ['test/specs/**/*-tests.ts'],
        globals: false,
        restoreMocks: true,
        clearMocks: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/ts/**/*.ts'],
        },
    },
});

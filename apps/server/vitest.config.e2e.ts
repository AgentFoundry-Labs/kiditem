import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['e2e/**/*.e2e.spec.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    testTimeout: 15000,
  },
});

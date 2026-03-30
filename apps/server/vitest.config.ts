import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['src/**/*.spec.ts', 'src/**/__tests__/*.spec.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
});

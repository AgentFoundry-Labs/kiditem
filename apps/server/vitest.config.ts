import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve @kiditem/shared from the worktree's local source (not root node_modules)
      // Required for git-worktree setups where node_modules symlink points to main branch
      '@kiditem/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    root: '.',
    include: ['src/**/*.spec.ts', 'src/**/__tests__/*.spec.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
});

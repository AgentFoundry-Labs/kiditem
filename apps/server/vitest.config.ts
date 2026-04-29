import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      // Resolve @kiditem/shared from the worktree's local source (not root node_modules)
      // Required for git-worktree setups where node_modules symlink points to main branch
      {
        find: /^@kiditem\/shared\/ai$/,
        replacement: path.resolve(__dirname, '../../packages/shared/src/ai.ts'),
      },
      {
        find: /^@kiditem\/shared$/,
        replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    ],
  },
  test: {
    root: '.',
    include: ['src/**/*.spec.ts', 'src/**/__tests__/*.spec.ts'],
    // `.pg.integration.spec.ts` 는 vitest.config.integration.ts 에서 실행 (real Postgres 필요)
    exclude: [
      'dist/**',
      'node_modules/**',
      'src/**/*.pg.integration.spec.ts',
      'src/**/__tests__/*.pg.integration.spec.ts',
    ],
  },
});

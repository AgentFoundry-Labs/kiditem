import { defineConfig } from 'vitest/config';
import path from 'path';

const sharedSrc = path.resolve(__dirname, '../../packages/shared/src');

export default defineConfig({
  resolve: {
    alias: [
      // Resolve @kiditem/shared from the worktree's local source (not root node_modules)
      // Required for git-worktree setups where node_modules symlink points to main branch
      { find: /^@kiditem\/shared$/, replacement: path.resolve(sharedSrc, 'index.ts') },
      { find: /^@kiditem\/shared\/errors$/, replacement: path.resolve(sharedSrc, 'errors/index.ts') },
      { find: /^@kiditem\/shared\/security$/, replacement: path.resolve(sharedSrc, 'security/index.ts') },
      { find: /^@kiditem\/shared\/panel$/, replacement: path.resolve(sharedSrc, 'panel/index.ts') },
      { find: /^@kiditem\/shared\/product$/, replacement: path.resolve(sharedSrc, 'product/index.ts') },
      { find: /^@kiditem\/shared\/sourcing$/, replacement: path.resolve(sharedSrc, 'sourcing/index.ts') },
      { find: /^@kiditem\/shared\/([^/]+)$/, replacement: path.resolve(sharedSrc, '$1.ts') },
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

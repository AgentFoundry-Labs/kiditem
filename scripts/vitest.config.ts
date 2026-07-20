import { defineConfig } from 'vitest/config';

// Standalone vitest project for the import scripts. The root `vitest.config.ts`
// limits its `projects` array to apps/* + packages/* so script-level helpers
// don't accidentally leak into the workspace test target. Run with:
//   npm run test:scripts
export default defineConfig({
  test: {
    name: 'scripts',
    root: __dirname,
    include: ['**/__tests__/*.spec.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});

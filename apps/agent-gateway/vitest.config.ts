import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const shared = resolve(import.meta.dirname, '../../packages/shared/src');

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@kiditem\/shared\/agent-runtime$/, replacement: resolve(shared, 'agent-runtime/index.ts') },
      { find: /^@kiditem\/shared\/agent-interaction$/, replacement: resolve(shared, 'agent-interaction/index.ts') },
    ],
  },
  test: {
    include: ['src/**/*.spec.ts'],
    // Several exact app-server fixtures deliberately bind the production
    // loopback boundary at 127.0.0.1:4000; parallel files would race that port.
    fileParallelism: false,
  },
});

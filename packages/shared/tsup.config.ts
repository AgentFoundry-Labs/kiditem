import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/schemas/index.ts',
    'src/product.ts',
    'src/order.ts',
    'src/inventory.ts',
    'src/ai.ts',
    'src/advertising.ts',
    'src/errors/index.ts',
    'src/server-errors.ts',
    'src/security/index.ts',
    'src/panel/index.ts',
    'src/dashboard.ts',
    'src/finance.ts',
    'src/marketplace.ts',
    'src/rules.ts',
    'src/action-task.ts',
    'src/supplier-stats.ts',
    'src/channel-dashboard.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  outDir: 'dist',
});

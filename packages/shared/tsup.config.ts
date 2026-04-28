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
    'src/security/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  outDir: 'dist',
});

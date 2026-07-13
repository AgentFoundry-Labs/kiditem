import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('product shared contract final ownership', () => {
  it('keeps only ContentWorkspace image contracts on the retired product subpath', () => {
    const source = readFileSync(new URL('./product.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(
      /MasterSchema|ProductOptionSchema|BundleComponentSchema|ProductCatalog|ProductManagement/,
    );
  });
});

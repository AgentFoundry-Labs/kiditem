import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const productHubRoot = resolve(
  process.cwd().endsWith('/apps/web') ? process.cwd() : resolve(process.cwd(), 'apps/web'),
  'src/app/(catalog)/product-hub',
);

function productionSource(
  dir = productHubRoot,
  excludedDirectories = new Set(['matching']),
): string {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (excludedDirectories.has(entry)) return [];
        return productionSource(path, excludedDirectories);
      }
        if (!/\.(ts|tsx)$/.test(entry) || /\.(spec|test)\./.test(entry)) return [];
        return [readFileSync(path, 'utf8')];
    })
    .join('\n');
}

describe('product hub final inventory ownership boundary', () => {
  it('reads KidItem products without presenting a Sellpia SKU as the product', () => {
    const source = productionSource();

    expect(source).toContain('/api/products/masters');
    expect(source).toContain('queryKeys.products.operations');
    expect(source).toContain('/api/products/recipe-component-candidates');
    expect(source).not.toContain('/api/inventory/sellpia-skus');
    expect(source).not.toContain('/api/channels/sku-availability');
    expect(source).not.toMatch(/\bProductOption(?:Schema|Create|Update|Delete)\b/);
  });

  it('keeps physical stock immutable and light-only outside the dedicated matching workspace', () => {
    const source = productionSource();

    expect(source).not.toContain('AddProductModal');
    expect(source).not.toContain('ExcelUploadModal');
    expect(source).not.toContain('/api/traffic/upload');
    expect(source).not.toContain('/api/inventory/adjust');
    expect(source).not.toContain('dark:');
  });
});

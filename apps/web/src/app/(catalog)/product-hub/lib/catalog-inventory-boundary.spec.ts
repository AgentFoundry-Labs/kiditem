import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const productHubRoot = resolve(
  process.cwd().endsWith('/apps/web') ? process.cwd() : resolve(process.cwd(), 'apps/web'),
  'src/app/(catalog)/product-hub',
);

function productionSource(dir = productHubRoot): string {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry === 'matching') return [];
        return productionSource(path);
      }
      if (!/\.(ts|tsx)$/.test(entry) || /\.(spec|test)\./.test(entry)) return [];
      return [readFileSync(path, 'utf8')];
    })
    .join('\n');
}

describe('product hub final inventory ownership boundary', () => {
  it('reads the Sellpia MasterProduct snapshot without any removed product API', () => {
    const source = productionSource();

    expect(source).toContain('/api/inventory/sellpia-skus');
    expect(source).not.toContain('/api/products');
    expect(source).not.toContain('queryKeys.products');
    expect(source).not.toContain('ProductOption');
  });

  it('is read-only and light-only outside the dedicated matching workspace', () => {
    const source = productionSource();

    expect(source).not.toContain('AddProductModal');
    expect(source).not.toContain('ExcelUploadModal');
    expect(source).not.toContain('상품 추가');
    expect(source).not.toContain('트래픽 업로드');
    expect(source).not.toContain('dark:');
  });

  it('keeps the option URL as an alias for the existing channel SKU matching workspace', () => {
    const source = readFileSync(join(productHubRoot, 'options/page.tsx'), 'utf8');

    expect(source).toContain("from '../matching/page'");
    expect(source).not.toContain('/api/products/options');
  });
});

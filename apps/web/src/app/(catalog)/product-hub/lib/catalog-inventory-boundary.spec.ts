import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const productHubRoot = resolve(
  process.cwd().endsWith('/apps/web') ? process.cwd() : resolve(process.cwd(), 'apps/web'),
  'src/app/(catalog)/product-hub',
);

function productionSource(
  dir = productHubRoot,
  excludedDirectories = new Set(['matching', 'options']),
): string {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (excludedDirectories.has(entry)) return [];
        return productionSource(path, excludedDirectories);
      }
        if (!/\.(ts|tsx)$/.test(entry) || /\.(spec|test)\./.test(entry)) return [];
        if (entry === 'ProductOptionsWorkspace.tsx') return [];
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

  it('renders the option URL with its own read-only Sellpia inventory query', () => {
    const pageSource = readFileSync(join(productHubRoot, 'options/page.tsx'), 'utf8');
    const workspaceSource = readFileSync(
      join(productHubRoot, 'components/ProductOptionsWorkspace.tsx'),
      'utf8',
    );

    expect(pageSource).toContain('ProductOptionsWorkspace');
    expect(pageSource).toContain('headingLevel={1}');
    expect(workspaceSource).toContain('useSellpiaInventorySkuPageState');
    expect(workspaceSource).toContain('SellpiaOptionTable');
    expect(workspaceSource).toContain('/api/inventory/sellpia-skus');
    expect(workspaceSource).not.toContain("from '../matching/page'");
    expect(workspaceSource).not.toContain('/api/products/options');
  });
});
